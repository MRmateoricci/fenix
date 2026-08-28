import crypto from 'crypto'
import path from 'path'
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'fs/promises'
import { setTimeout as delay } from 'timers/promises'
import {
  backupChunkBytes,
  backupEncryptionSecret,
  backupMaxUploadBytes,
  backupsDir,
  pgDumpPath,
  psqlPath,
} from '../config/backups.js'
import { uploadsDir } from '../config/uploads.js'
import { transferProofsDir } from '../config/transferProofs.js'
import {
  createEncryptedBackup,
  decryptBackup,
  extractAndValidateBackup,
  readBackupHeader,
} from './backupArchive.js'
import {
  dumpDatabase,
  readCommandVersion,
  restoreDatabase,
} from './backupDatabase.js'

const BACKUP_FILE_PATTERN = /^fenix-backup-[a-z0-9_-]+\.fenix$/i
const UPLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/i
const APP_VERSION = '1.0.1'

export class BackupOperationError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  return `${Math.ceil(bytes / 1024 ** 2)} MiB`
}

function publicJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt || null,
    fileName: job.fileName || null,
    safetyBackupFileName: job.safetyBackupFileName || null,
    error: job.error || null,
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const DIRECTORY_MOVE_RETRY_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])
const DIRECTORY_COPY_FALLBACK_CODES = new Set(['EACCES', 'EBUSY', 'EPERM', 'EXDEV'])

async function moveDirectory(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true })
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      if (!DIRECTORY_MOVE_RETRY_CODES.has(error.code) || attempt >= 4) throw error
      await delay(150 * (attempt + 1))
    }
  }
}

async function clearDirectory(directory) {
  await mkdir(directory, { recursive: true })
  const entries = await readdir(directory)
  await Promise.all(entries.map(entry => rm(path.join(directory, entry), {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100,
  })))
}

async function copyDirectoryContents(source, destination) {
  await mkdir(destination, { recursive: true })
  await cp(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  })
}

async function replaceDirectoryContents(destination, source) {
  await clearDirectory(destination)
  await copyDirectoryContents(source, destination)
}

export class BackupManager {
  constructor(options = {}) {
    this.backupsDir = options.backupsDir || backupsDir
    this.uploadsDir = options.uploadsDir || uploadsDir
    this.transferProofsDir = options.transferProofsDir || transferProofsDir
    this.secret = options.secret ?? backupEncryptionSecret
    this.databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL
    this.pgDumpPath = options.pgDumpPath || pgDumpPath
    this.psqlPath = options.psqlPath || psqlPath
    this.chunkBytes = options.chunkBytes || backupChunkBytes
    this.maxUploadBytes = options.maxUploadBytes || backupMaxUploadBytes
    this.dumpDatabase = options.dumpDatabase || dumpDatabase
    this.restoreDatabase = options.restoreDatabase || restoreDatabase
    this.readCommandVersion = options.readCommandVersion || readCommandVersion
    this.moveDirectory = options.moveDirectory || moveDirectory
    this.jobs = new Map()
    this.operation = null
    this.maintenance = false
    this.toolStatus = null
    this.toolStatusAt = 0
    this.lastIncomingCleanupAt = 0
  }

  get incomingDir() { return path.join(this.backupsDir, '.incoming') }
  get workDir() { return path.join(this.backupsDir, '.work') }

  async initialize() {
    await mkdir(this.backupsDir, { recursive: true })
    await mkdir(this.incomingDir, { recursive: true })
    await mkdir(this.workDir, { recursive: true })
    if (Date.now() - this.lastIncomingCleanupAt > 60 * 60 * 1000) {
      this.lastIncomingCleanupAt = Date.now()
      const entries = await readdir(this.incomingDir, { withFileTypes: true })
      await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
        const directory = path.join(this.incomingDir, entry.name)
        const details = await stat(directory)
        if (Date.now() - details.mtimeMs > 24 * 60 * 60 * 1000) {
          await rm(directory, { recursive: true, force: true })
        }
      }))
    }
  }

  isMaintenanceMode() {
    return this.maintenance
  }

  assertConfigured() {
    if (!this.databaseUrl) throw new BackupOperationError('DATABASE_URL no está configurada', 503)
    if (!this.secret || this.secret.length < 32) {
      throw new BackupOperationError('BACKUP_ENCRYPTION_KEY debe tener al menos 32 caracteres', 503)
    }
  }

  reserveOperation(kind, jobId) {
    if (this.operation) {
      throw new BackupOperationError(`Ya hay una operación de ${this.operation.kind} en curso`, 409)
    }
    this.operation = { kind, jobId }
  }

  releaseOperation(jobId) {
    if (this.operation?.jobId === jobId) this.operation = null
  }

  createJob(kind) {
    const job = {
      id: crypto.randomUUID(),
      kind,
      status: 'queued',
      phase: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
    }
    this.jobs.set(job.id, job)
    if (this.jobs.size > 50) {
      const completed = [...this.jobs.values()].find(item => ['completed', 'failed'].includes(item.status))
      if (completed) this.jobs.delete(completed.id)
    }
    return job
  }

  updateJob(job, patch) {
    Object.assign(job, patch)
  }

  failJob(job, error) {
    console.error(`[backups] ${job.kind} ${job.id} falló:`, error)
    this.updateJob(job, {
      status: 'failed',
      phase: 'failed',
      finishedAt: new Date().toISOString(),
      error: error.message || 'La operación falló',
    })
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new BackupOperationError('Operación no encontrada', 404)
    return publicJob(job)
  }

  async tools() {
    if (this.toolStatus && Date.now() - this.toolStatusAt < 30_000) return this.toolStatus
    const [pgDump, psql] = await Promise.all([
      this.readCommandVersion(this.pgDumpPath),
      this.readCommandVersion(this.psqlPath),
    ])
    this.toolStatus = { pgDump, psql }
    this.toolStatusAt = Date.now()
    return this.toolStatus
  }

  async status() {
    await this.initialize()
    const tools = await this.tools()
    const configured = Boolean(this.databaseUrl && this.secret?.length >= 32 && tools.pgDump.available && tools.psql.available)
    const filesystem = await statfs(this.backupsDir)
    return {
      configured,
      configuration: {
        database: Boolean(this.databaseUrl),
        encryption: this.secret?.length >= 32,
        pgDump: tools.pgDump,
        psql: tools.psql,
      },
      backups: await this.listBackups(),
      jobs: [...this.jobs.values()].map(publicJob).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      operation: this.operation,
      maintenance: this.maintenance,
      chunkBytes: this.chunkBytes,
      maxUploadBytes: this.maxUploadBytes,
      storage: {
        freeBytes: Number(filesystem.bavail) * Number(filesystem.bsize),
        totalBytes: Number(filesystem.blocks) * Number(filesystem.bsize),
      },
    }
  }

  backupFilePath(fileName) {
    if (!BACKUP_FILE_PATTERN.test(fileName) || path.basename(fileName) !== fileName) {
      throw new BackupOperationError('Nombre de backup inválido')
    }
    return path.join(this.backupsDir, fileName)
  }

  async listBackups() {
    await this.initialize()
    const entries = await readdir(this.backupsDir, { withFileTypes: true })
    const backups = []
    for (const entry of entries) {
      if (!entry.isFile() || !BACKUP_FILE_PATTERN.test(entry.name)) continue
      const filePath = path.join(this.backupsDir, entry.name)
      const details = await stat(filePath)
      try {
        const { header } = await readBackupHeader(filePath)
        backups.push({
          fileName: entry.name,
          id: header.id,
          type: header.type,
          createdAt: header.createdAt,
          size: details.size,
          validHeader: true,
        })
      } catch {
        backups.push({
          fileName: entry.name,
          id: null,
          type: 'unknown',
          createdAt: details.mtime.toISOString(),
          size: details.size,
          validHeader: false,
        })
      }
    }
    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async startBackup() {
    await this.initialize()
    this.assertConfigured()
    const tools = await this.tools()
    if (!tools.pgDump.available) throw new BackupOperationError('pg_dump no está disponible', 503)
    const job = this.createJob('backup')
    this.reserveOperation('backup', job.id)
    setImmediate(() => this.runManualBackup(job))
    return publicJob(job)
  }

  async runManualBackup(job) {
    try {
      this.updateJob(job, { status: 'running', phase: 'database', progress: 2 })
      const result = await this.generateBackup('manual', update => this.updateJob(job, update))
      this.updateJob(job, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        fileName: result.fileName,
        finishedAt: new Date().toISOString(),
      })
    } catch (error) {
      this.failJob(job, error)
    } finally {
      this.releaseOperation(job.id)
    }
  }

  async generateBackup(type, onJobUpdate = () => {}) {
    const work = await mkdtemp(path.join(this.workDir, 'backup-'))
    const databaseDumpPath = path.join(work, 'database.sql')
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const fileName = `fenix-backup-${timestampForFilename(new Date(createdAt)).toLowerCase()}-${type.replaceAll('_', '-')}-${id.slice(0, 8)}.fenix`
    const outputPath = this.backupFilePath(fileName)

    try {
      onJobUpdate({ phase: 'database', progress: 3 })
      await this.dumpDatabase({
        databaseUrl: this.databaseUrl,
        outputPath: databaseDumpPath,
        pgDumpPath: this.pgDumpPath,
      })
      onJobUpdate({ phase: 'indexing', progress: 12 })
      await createEncryptedBackup({
        outputPath,
        databaseDumpPath,
        uploadsDir: this.uploadsDir,
        transferProofsDir: this.transferProofsDir,
        secret: this.secret,
        metadata: { id, type, createdAt, appVersion: APP_VERSION },
        onProgress: update => onJobUpdate({
          phase: update.phase,
          progress: Math.max(12, update.progress),
        }),
      })
      return { fileName, outputPath }
    } catch (error) {
      await rm(outputPath, { force: true }).catch(() => {})
      throw error
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {})
    }
  }

  async deleteBackup(fileName) {
    const filePath = this.backupFilePath(fileName)
    if (this.operation) throw new BackupOperationError('No se puede borrar un backup durante otra operación', 409)
    if (!await pathExists(filePath)) throw new BackupOperationError('Backup no encontrado', 404)
    await rm(filePath, { force: true })
  }

  uploadDirectory(uploadId) {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) throw new BackupOperationError('Carga no encontrada', 404)
    return path.join(this.incomingDir, uploadId)
  }

  async initializeUpload({ fileName, totalSize, totalChunks }) {
    await this.initialize()
    this.assertConfigured()
    const size = Number(totalSize)
    const chunks = Number(totalChunks)
    const expectedChunks = Math.ceil(size / this.chunkBytes)
    if (!fileName?.toLowerCase().endsWith('.fenix')) throw new BackupOperationError('Seleccioná un archivo .fenix')
    if (!Number.isSafeInteger(size) || size <= 0 || size > this.maxUploadBytes) {
      throw new BackupOperationError('El tamaño del backup no es válido')
    }
    if (!Number.isSafeInteger(chunks) || chunks !== expectedChunks) {
      throw new BackupOperationError('La cantidad de partes del backup no es válida')
    }

    const id = crypto.randomUUID()
    const directory = this.uploadDirectory(id)
    await mkdir(directory, { recursive: true })
    const metadata = {
      id,
      fileName: path.basename(fileName),
      totalSize: size,
      totalChunks: chunks,
      chunkBytes: this.chunkBytes,
      createdAt: new Date().toISOString(),
    }
    await writeFile(path.join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' })
    const uploadHandle = await open(path.join(directory, 'upload.fenix'), 'wx')
    await uploadHandle.close()
    return metadata
  }

  async readUpload(uploadId) {
    const directory = this.uploadDirectory(uploadId)
    try {
      return JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') throw new BackupOperationError('Carga no encontrada', 404)
      throw error
    }
  }

  uploadFilePath(directory) {
    return path.join(directory, 'upload.fenix')
  }

  chunkMarkerPath(directory, index) {
    return path.join(directory, `received-${String(index).padStart(6, '0')}.marker`)
  }

  async writeUploadChunk(uploadId, indexValue, buffer) {
    const metadata = await this.readUpload(uploadId)
    const index = Number(indexValue)
    if (!Number.isSafeInteger(index) || index < 0 || index >= metadata.totalChunks) {
      throw new BackupOperationError('Número de parte inválido')
    }
    if (!Buffer.isBuffer(buffer)) throw new BackupOperationError('La parte del backup es inválida')
    const expectedSize = index === metadata.totalChunks - 1
      ? metadata.totalSize - (metadata.chunkBytes * index)
      : metadata.chunkBytes
    if (buffer.length !== expectedSize) throw new BackupOperationError('El tamaño de la parte no coincide')

    const directory = this.uploadDirectory(uploadId)
    const handle = await open(this.uploadFilePath(directory), 'r+')
    try {
      let offset = 0
      const position = index * metadata.chunkBytes
      while (offset < buffer.length) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, position + offset)
        if (!bytesWritten) throw new Error('No se pudo guardar la parte del backup')
        offset += bytesWritten
      }
      await handle.sync()
    } finally {
      await handle.close()
    }
    await writeFile(this.chunkMarkerPath(directory, index), '')
    return this.uploadStatus(uploadId)
  }

  async uploadStatus(uploadId) {
    const metadata = await this.readUpload(uploadId)
    const directory = this.uploadDirectory(uploadId)
    const entries = await readdir(directory)
    const receivedChunks = entries.filter(name => /^received-\d{6}\.marker$/.test(name)).length
    return { ...metadata, receivedChunks }
  }

  async validateCompletedUpload(metadata) {
    const directory = this.uploadDirectory(metadata.id)
    for (let index = 0; index < metadata.totalChunks; index += 1) {
      if (!await pathExists(this.chunkMarkerPath(directory, index))) {
        throw new BackupOperationError(`Falta la parte ${index + 1} del backup`)
      }
    }
    const assembled = await stat(this.uploadFilePath(directory))
    if (assembled.size !== metadata.totalSize) throw new BackupOperationError('El backup ensamblado está incompleto')
    return this.uploadFilePath(directory)
  }

  async startRestoreFromUpload(uploadId) {
    await this.initialize()
    this.assertConfigured()
    const tools = await this.tools()
    if (!tools.pgDump.available || !tools.psql.available) {
      throw new BackupOperationError('pg_dump y psql deben estar disponibles para restaurar', 503)
    }
    const metadata = await this.readUpload(uploadId)
    const status = await this.uploadStatus(uploadId)
    if (status.receivedChunks !== metadata.totalChunks) throw new BackupOperationError('Todavía faltan partes del backup')
    const job = this.createJob('restore')
    this.reserveOperation('restore', job.id)
    setImmediate(() => this.runRestore(job, { upload: metadata }))
    return publicJob(job)
  }

  async startRestoreFromFile(fileName) {
    await this.initialize()
    this.assertConfigured()
    const tools = await this.tools()
    if (!tools.pgDump.available || !tools.psql.available) {
      throw new BackupOperationError('pg_dump y psql deben estar disponibles para restaurar', 503)
    }
    const inputPath = this.backupFilePath(fileName)
    if (!await pathExists(inputPath)) throw new BackupOperationError('Backup no encontrado', 404)
    const job = this.createJob('restore')
    this.reserveOperation('restore', job.id)
    setImmediate(() => this.runRestore(job, { inputPath }))
    return publicJob(job)
  }

  async activateRestoredFiles(extractDir, jobId) {
    const definitions = [
      { active: this.uploadsDir, replacement: path.join(extractDir, 'uploads'), label: 'uploads' },
      { active: this.transferProofsDir, replacement: path.join(extractDir, 'transfer-proofs'), label: 'transfer-proofs' },
    ]
    const swaps = []
    try {
      for (const definition of definitions) {
        const previous = path.join(this.workDir, `previous-${jobId}-${definition.label}`)
        await rm(previous, { recursive: true, force: true })
        const hadActive = await pathExists(definition.active)
        let mode = 'rename'
        if (hadActive) {
          try {
            await this.moveDirectory(definition.active, previous)
          } catch (error) {
            if (!DIRECTORY_COPY_FALLBACK_CODES.has(error.code)) throw error
            mode = 'copy'
            console.warn(`[backups] ${definition.label} no admite rename (${error.code}); usando reemplazo compatible`)
            await copyDirectoryContents(definition.active, previous)
          }
        }
        const swap = { ...definition, previous, mode, hadActive }
        try {
          if (mode === 'copy') {
            await replaceDirectoryContents(definition.active, definition.replacement)
          } else {
            try {
              await this.moveDirectory(definition.replacement, definition.active)
            } catch (error) {
              if (!DIRECTORY_COPY_FALLBACK_CODES.has(error.code)) throw error
              console.warn(`[backups] ${definition.label} no admite mover el reemplazo (${error.code}); copiando contenido`)
              await copyDirectoryContents(definition.replacement, definition.active)
            }
          }
        } catch (error) {
          await this.rollbackFileSwaps([swap]).catch(rollbackError => {
            console.error(`[backups] no se pudo revertir ${definition.label}: ${rollbackError.message}`)
          })
          throw error
        }
        swaps.push(swap)
      }
      return swaps
    } catch (error) {
      await this.rollbackFileSwaps(swaps)
      throw error
    }
  }

  async rollbackFileSwaps(swaps) {
    for (const swap of [...swaps].reverse()) {
      if (swap.mode === 'copy') {
        if (swap.hadActive && await pathExists(swap.previous)) {
          await replaceDirectoryContents(swap.active, swap.previous)
        } else {
          await rm(swap.active, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
        }
        continue
      }
      await rm(swap.active, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }).catch(() => {})
      if (swap.hadActive && await pathExists(swap.previous)) await this.moveDirectory(swap.previous, swap.active)
    }
  }

  async finalizeFileSwaps(swaps) {
    for (const swap of swaps) {
      await rm(swap.previous, { recursive: true, force: true }).catch(error => {
        console.warn(`[backups] no se pudo limpiar ${swap.previous}: ${error.message}`)
      })
    }
  }

  async runRestore(job, source) {
    const work = await mkdtemp(path.join(this.workDir, `restore-${job.id}-`))
    const encryptedPath = source.inputPath || this.uploadFilePath(this.uploadDirectory(source.upload.id))
    const zipPath = path.join(work, 'decrypted.zip')
    const extractDir = path.join(work, 'extracted')
    let swaps = []

    try {
      this.updateJob(job, { status: 'running', phase: 'assembling', progress: 2 })
      if (source.upload) await this.validateCompletedUpload(source.upload)
      const inputDetails = await stat(encryptedPath)
      const filesystem = await statfs(this.backupsDir)
      const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
      const requiredBytes = (inputDetails.size * 3) + (256 * 1024 * 1024)
      if (freeBytes < requiredBytes) {
        throw new BackupOperationError(
          `Espacio insuficiente para restaurar: hay ${formatBytes(freeBytes)} libres y se requieren aproximadamente ${formatBytes(requiredBytes)}`,
          507,
        )
      }
      this.updateJob(job, { phase: 'decrypting', progress: 12 })
      await decryptBackup({ inputPath: encryptedPath, outputZipPath: zipPath, secret: this.secret })
      this.updateJob(job, { phase: 'validating', progress: 22 })
      await extractAndValidateBackup({
        zipPath,
        extractDir,
        maxExtractedBytes: this.maxUploadBytes * 2,
      })

      this.maintenance = true
      this.updateJob(job, { phase: 'safety_backup', progress: 38 })
      const safety = await this.generateBackup('pre_restore', update => {
        const mapped = 38 + Math.round((Number(update.progress || 0) / 100) * 35)
        this.updateJob(job, { phase: 'safety_backup', progress: Math.min(73, mapped) })
      })
      job.safetyBackupFileName = safety.fileName

      this.updateJob(job, { phase: 'restoring_files', progress: 78 })
      swaps = await this.activateRestoredFiles(extractDir, job.id)
      try {
        this.updateJob(job, { phase: 'restoring_database', progress: 88 })
        await this.restoreDatabase({
          databaseUrl: this.databaseUrl,
          inputPath: path.join(extractDir, 'database.sql'),
          psqlPath: this.psqlPath,
        })
      } catch (error) {
        await this.rollbackFileSwaps(swaps)
        swaps = []
        throw error
      }

      await this.finalizeFileSwaps(swaps)
      swaps = []
      if (source.upload) {
        await rm(this.uploadDirectory(source.upload.id), { recursive: true, force: true }).catch(error => {
          console.warn(`[backups] no se pudo limpiar la carga ${source.upload.id}: ${error.message}`)
        })
      }
      this.maintenance = false
      this.releaseOperation(job.id)
      this.updateJob(job, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        finishedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (swaps.length) await this.rollbackFileSwaps(swaps).catch(() => {})
      this.failJob(job, error)
    } finally {
      this.maintenance = false
      this.releaseOperation(job.id)
      await rm(work, { recursive: true, force: true }).catch(() => {})
    }
  }
}

export const backupManager = new BackupManager()
