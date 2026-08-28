import crypto from 'crypto'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import {
  appendFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'

export const BACKUP_FORMAT = 'fenix-backup'
export const BACKUP_FORMAT_VERSION = 1
const MAGIC = Buffer.from('FENIXB01', 'ascii')
const TAG_LENGTH = 16
const MAX_HEADER_BYTES = 64 * 1024
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024
let archiveModulesPromise

function archiveModules() {
  archiveModulesPromise ||= Promise.all([import('archiver'), import('unzipper')])
    .then(([archiverModule, unzipperModule]) => ({
      ZipArchive: archiverModule.ZipArchive,
      unzipper: unzipperModule.default || unzipperModule,
    }))
  return archiveModulesPromise
}

function encryptionKey(secret) {
  if (!secret || secret.length < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY debe tener al menos 32 caracteres')
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

function portablePath(value) {
  return value.split(path.sep).join('/')
}

export async function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

async function collectDirectoryFiles(root, onFile) {
  const files = []
  const stack = ['']

  while (stack.length) {
    const relativeDir = stack.pop()
    const absoluteDir = path.join(root, relativeDir)
    const entries = await readdir(absoluteDir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name)
      const absolutePath = path.join(root, relativePath)
      const details = await lstat(absolutePath)
      if (details.isSymbolicLink()) {
        throw new Error(`No se permiten enlaces simbólicos en backups: ${portablePath(relativePath)}`)
      }
      if (details.isDirectory()) {
        stack.push(relativePath)
        continue
      }
      if (!details.isFile()) continue

      const item = {
        path: portablePath(relativePath),
        size: details.size,
        sha256: await hashFile(absolutePath),
      }
      files.push(item)
      onFile?.(item)
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function buildEnvelopeHeader(metadata) {
  const iv = crypto.randomBytes(12)
  const header = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    encryption: 'aes-256-gcm',
    iv: iv.toString('base64'),
    id: metadata.id,
    type: metadata.type,
    createdAt: metadata.createdAt,
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(headerBytes.length)
  return {
    header,
    iv,
    prefix: Buffer.concat([MAGIC, length, headerBytes]),
  }
}

export async function createEncryptedBackup({
  outputPath,
  databaseDumpPath,
  uploadsDir,
  transferProofsDir,
  secret,
  metadata,
  onProgress,
}) {
  const partialPath = `${outputPath}.partial`
  await rm(partialPath, { force: true })

  try {
    let scannedFiles = 0
    onProgress?.({ phase: 'indexing', progress: 5 })
    const uploads = await collectDirectoryFiles(uploadsDir, () => {
      scannedFiles += 1
      if (scannedFiles % 100 === 0) onProgress?.({ phase: 'indexing', progress: 10 })
    })
    const transferProofs = await collectDirectoryFiles(transferProofsDir, () => {
      scannedFiles += 1
    })
    const databaseStat = await stat(databaseDumpPath)
    const manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      id: metadata.id,
      type: metadata.type,
      createdAt: metadata.createdAt,
      appVersion: metadata.appVersion,
      database: {
        path: 'database.sql',
        size: databaseStat.size,
        sha256: await hashFile(databaseDumpPath),
      },
      files: {
        uploads,
        transferProofs,
      },
    }

    const { header, iv, prefix } = buildEnvelopeHeader(metadata)
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
    cipher.setAAD(prefix)
    await writeFile(partialPath, prefix, { flag: 'wx' })

    const { ZipArchive } = await archiveModules()
    const archive = new ZipArchive({ zlib: { level: 6 }, forceZip64: true })
    const output = createWriteStream(partialPath, { flags: 'a' })
    archive.on('progress', progress => {
      const processed = progress.fs.processedBytes || 0
      const total = progress.fs.totalBytes || 1
      onProgress?.({
        phase: 'archiving',
        progress: 15 + Math.min(75, Math.round((processed / total) * 75)),
      })
    })
    archive.on('warning', error => archive.emit('error', error))

    archive.file(databaseDumpPath, { name: 'database.sql' })
    archive.directory(uploadsDir, 'uploads')
    archive.directory(transferProofsDir, 'transfer-proofs')
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    const pipePromise = pipeline(archive, cipher, output)
    await archive.finalize()
    await pipePromise
    await appendFile(partialPath, cipher.getAuthTag())
    await rename(partialPath, outputPath)
    onProgress?.({ phase: 'completed', progress: 100 })

    const outputStat = await stat(outputPath)
    return { header, manifest, size: outputStat.size }
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function readBackupHeader(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const prefix = Buffer.alloc(MAGIC.length + 4)
    const firstRead = await handle.read(prefix, 0, prefix.length, 0)
    if (firstRead.bytesRead !== prefix.length || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('El archivo no es un backup de Fénix')
    }
    const headerLength = prefix.readUInt32BE(MAGIC.length)
    if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES) {
      throw new Error('El encabezado del backup es inválido')
    }
    const headerBytes = Buffer.alloc(headerLength)
    const headerRead = await handle.read(headerBytes, 0, headerLength, prefix.length)
    if (headerRead.bytesRead !== headerLength) throw new Error('El backup está incompleto')
    const header = JSON.parse(headerBytes.toString('utf8'))
    if (header.format !== BACKUP_FORMAT || header.version !== BACKUP_FORMAT_VERSION) {
      throw new Error('La versión del backup no es compatible')
    }
    return {
      header,
      prefix: Buffer.concat([prefix, headerBytes]),
      encryptedOffset: prefix.length + headerLength,
    }
  } finally {
    await handle.close()
  }
}

export async function decryptBackup({ inputPath, outputZipPath, secret }) {
  const fileStat = await stat(inputPath)
  const { header, prefix, encryptedOffset } = await readBackupHeader(inputPath)
  if (fileStat.size <= encryptedOffset + TAG_LENGTH) throw new Error('El backup está incompleto')

  const handle = await open(inputPath, 'r')
  const tag = Buffer.alloc(TAG_LENGTH)
  try {
    await handle.read(tag, 0, TAG_LENGTH, fileStat.size - TAG_LENGTH)
  } finally {
    await handle.close()
  }

  const iv = Buffer.from(header.iv || '', 'base64')
  if (iv.length !== 12) throw new Error('El vector de cifrado del backup es inválido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), iv)
  decipher.setAAD(prefix)
  decipher.setAuthTag(tag)

  await rm(outputZipPath, { force: true })
  try {
    await pipeline(
      createReadStream(inputPath, { start: encryptedOffset, end: fileStat.size - TAG_LENGTH - 1 }),
      decipher,
      createWriteStream(outputZipPath, { flags: 'wx' }),
    )
    return header
  } catch (error) {
    await rm(outputZipPath, { force: true }).catch(() => {})
    if (/authenticate|auth/i.test(error.message)) {
      throw new Error('No se pudo descifrar el backup: clave incorrecta o archivo alterado')
    }
    throw error
  }
}

function validatedEntryPath(entryPath) {
  if (!entryPath || entryPath.includes('\\') || entryPath.includes('\0') || path.posix.isAbsolute(entryPath)) {
    throw new Error('El backup contiene una ruta inválida')
  }
  const normalized = path.posix.normalize(entryPath)
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('El backup intenta escribir fuera del directorio de restauración')
  }
  const allowed = normalized === 'manifest.json' || normalized === 'database.sql'
    || normalized === 'uploads' || normalized.startsWith('uploads/')
    || normalized === 'transfer-proofs' || normalized.startsWith('transfer-proofs/')
  if (!allowed) throw new Error(`Entrada no permitida en el backup: ${normalized}`)
  return normalized
}

function absoluteExtractionPath(root, entryPath) {
  const absolute = path.resolve(root, ...entryPath.split('/'))
  const relative = path.relative(root, absolute)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('El backup contiene una ruta insegura')
  }
  return absolute
}

function isZipSymlink(entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
  return unixMode === 0o120000
}

async function verifyManifestFiles(extractDir, manifest) {
  if (manifest?.format !== BACKUP_FORMAT || manifest?.version !== BACKUP_FORMAT_VERSION) {
    throw new Error('El manifiesto del backup no es compatible')
  }
  if (!manifest.database || !manifest.files || !Array.isArray(manifest.files.uploads) || !Array.isArray(manifest.files.transferProofs)) {
    throw new Error('El manifiesto del backup está incompleto')
  }

  const expected = new Map()
  function addExpected(entryPath, item) {
    const normalized = validatedEntryPath(entryPath)
    if (expected.has(normalized)) throw new Error(`Entrada duplicada en el manifiesto: ${normalized}`)
    if (!Number.isSafeInteger(item?.size) || item.size < 0 || !/^[a-f0-9]{64}$/i.test(item?.sha256 || '')) {
      throw new Error(`Metadatos inválidos en el manifiesto: ${normalized}`)
    }
    expected.set(normalized, item)
  }
  addExpected('database.sql', manifest.database)
  for (const item of manifest.files.uploads) addExpected(`uploads/${item.path}`, item)
  for (const item of manifest.files.transferProofs) addExpected(`transfer-proofs/${item.path}`, item)

  const actual = new Map()
  for (const [folder, prefix] of [['uploads', 'uploads'], ['transfer-proofs', 'transfer-proofs']]) {
    const entries = await collectDirectoryFiles(path.join(extractDir, folder))
    for (const item of entries) actual.set(`${prefix}/${item.path}`, item)
  }
  const databasePath = path.join(extractDir, 'database.sql')
  const databaseStat = await stat(databasePath)
  actual.set('database.sql', {
    path: 'database.sql',
    size: databaseStat.size,
    sha256: await hashFile(databasePath),
  })

  if (actual.size !== expected.size) throw new Error('La cantidad de archivos no coincide con el manifiesto')
  for (const [entryPath, expectedFile] of expected) {
    const actualFile = actual.get(entryPath)
    if (!actualFile || actualFile.size !== expectedFile.size || actualFile.sha256 !== expectedFile.sha256) {
      throw new Error(`Falló la verificación de integridad: ${entryPath}`)
    }
  }
}

export async function extractAndValidateBackup({ zipPath, extractDir, maxExtractedBytes }) {
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  const { unzipper } = await archiveModules()
  const zip = await unzipper.Open.file(zipPath)
  const seen = new Set()
  let declaredBytes = 0
  let extractedBytes = 0
  const entries = []

  for (const entry of zip.files) {
    const entryPath = validatedEntryPath(entry.path)
    if (seen.has(entryPath)) throw new Error(`Entrada duplicada en el backup: ${entryPath}`)
    seen.add(entryPath)
    if (isZipSymlink(entry)) throw new Error('El backup contiene enlaces simbólicos')
    declaredBytes += Number(entry.vars?.uncompressedSize || 0)
    if (declaredBytes > maxExtractedBytes) throw new Error('El contenido descomprimido supera el límite permitido')
    if (!['Directory', 'File'].includes(entry.type)) throw new Error(`Tipo de entrada no permitido: ${entryPath}`)
    entries.push({ entry, entryPath, target: absoluteExtractionPath(extractDir, entryPath) })
  }

  for (const { entry, entryPath, target } of entries) {
    if (entry.type === 'Directory') {
      await mkdir(target, { recursive: true })
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        extractedBytes += chunk.length
        if (extractedBytes > maxExtractedBytes) return callback(new Error('El contenido descomprimido supera el límite permitido'))
        callback(null, chunk)
      },
    })
    await pipeline(entry.stream(), limiter, createWriteStream(target, { flags: 'wx' }))
  }

  const manifestPath = path.join(extractDir, 'manifest.json')
  const manifestStat = await stat(manifestPath)
  if (manifestStat.size > MAX_MANIFEST_BYTES) throw new Error('El manifiesto del backup es demasiado grande')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await mkdir(path.join(extractDir, 'uploads'), { recursive: true })
  await mkdir(path.join(extractDir, 'transfer-proofs'), { recursive: true })
  await verifyManifestFiles(extractDir, manifest)
  return manifest
}
