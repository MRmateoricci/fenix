import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { ZipArchive } from 'archiver'
import {
  createEncryptedBackup,
  decryptBackup,
  extractAndValidateBackup,
  readBackupHeader,
} from './backupArchive.js'

const SECRET = 'backup-test-secret-with-more-than-thirty-two-characters'

async function createZip(filePath, entries) {
  const archive = new ZipArchive()
  const completed = pipeline(archive, createWriteStream(filePath))
  for (const entry of entries) archive.append(entry.content, { name: entry.name })
  await archive.finalize()
  await completed
}

test('crea, cifra, descifra y valida un backup completo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-archive-'))
  const uploads = path.join(root, 'uploads')
  const proofs = path.join(root, 'proofs')
  const database = path.join(root, 'database.sql')
  const encrypted = path.join(root, 'backup.fenix')
  const decrypted = path.join(root, 'backup.zip')
  const extracted = path.join(root, 'extracted')

  try {
    await mkdir(path.join(uploads, 'products'), { recursive: true })
    await mkdir(proofs, { recursive: true })
    await writeFile(path.join(uploads, 'products', 'lamp.png'), Buffer.from([1, 2, 3, 4]))
    await writeFile(path.join(proofs, 'proof.pdf'), 'comprobante')
    await writeFile(database, 'CREATE TABLE backup_test(id integer);')

    const createdAt = new Date().toISOString()
    await createEncryptedBackup({
      outputPath: encrypted,
      databaseDumpPath: database,
      uploadsDir: uploads,
      transferProofsDir: proofs,
      secret: SECRET,
      metadata: { id: 'test-id', type: 'manual', createdAt, appVersion: 'test' },
    })

    const { header } = await readBackupHeader(encrypted)
    assert.equal(header.id, 'test-id')
    assert.equal(header.createdAt, createdAt)

    await decryptBackup({ inputPath: encrypted, outputZipPath: decrypted, secret: SECRET })
    const manifest = await extractAndValidateBackup({
      zipPath: decrypted,
      extractDir: extracted,
      maxExtractedBytes: 10 * 1024 * 1024,
    })

    assert.equal(manifest.files.uploads.length, 1)
    assert.equal(await readFile(path.join(extracted, 'uploads', 'products', 'lamp.png'), 'hex'), '01020304')
    assert.equal(await readFile(path.join(extracted, 'transfer-proofs', 'proof.pdf'), 'utf8'), 'comprobante')
    assert.equal(await readFile(path.join(extracted, 'database.sql'), 'utf8'), 'CREATE TABLE backup_test(id integer);')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rechaza una clave incorrecta o un archivo alterado', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-key-'))
  const uploads = path.join(root, 'uploads')
  const proofs = path.join(root, 'proofs')
  const database = path.join(root, 'database.sql')
  const encrypted = path.join(root, 'backup.fenix')

  try {
    await mkdir(uploads)
    await mkdir(proofs)
    await writeFile(database, 'SELECT 1;')
    await createEncryptedBackup({
      outputPath: encrypted,
      databaseDumpPath: database,
      uploadsDir: uploads,
      transferProofsDir: proofs,
      secret: SECRET,
      metadata: { id: 'test-id', type: 'manual', createdAt: new Date().toISOString(), appVersion: 'test' },
    })
    await assert.rejects(
      decryptBackup({ inputPath: encrypted, outputZipPath: path.join(root, 'bad.zip'), secret: `${SECRET}-different` }),
      /clave incorrecta|archivo alterado/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rechaza entradas fuera del formato permitido', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-entry-'))
  const zipPath = path.join(root, 'invalid.zip')
  try {
    await createZip(zipPath, [{ name: 'unexpected.txt', content: 'no permitido' }])
    await assert.rejects(
      extractAndValidateBackup({ zipPath, extractDir: path.join(root, 'out'), maxExtractedBytes: 1024 }),
      /Entrada no permitida/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
