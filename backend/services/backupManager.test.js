import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { BackupManager } from './backupManager.js'

async function waitForJob(manager, jobId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = manager.getJob(jobId)
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(job.error)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('La operación no terminó a tiempo')
}

test('genera un backup y restaura archivos con copia preventiva', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-manager-'))
  const backups = path.join(root, 'backups')
  const uploads = path.join(root, 'uploads')
  const proofs = path.join(root, 'proofs')
  let dumpNumber = 0
  let restoredSql = ''

  try {
    await mkdir(backups)
    await mkdir(uploads)
    await mkdir(proofs)
    await writeFile(path.join(uploads, 'original.jpg'), 'imagen original')
    await writeFile(path.join(proofs, 'original.pdf'), 'comprobante original')

    const manager = new BackupManager({
      backupsDir: backups,
      uploadsDir: uploads,
      transferProofsDir: proofs,
      secret: 'manager-test-secret-with-more-than-thirty-two-characters',
      databaseUrl: 'postgresql://test/database',
      pgDumpPath: 'pg_dump-test',
      psqlPath: 'psql-test',
      chunkBytes: 256,
      readCommandVersion: async command => ({ available: true, version: `${command} 1` }),
      dumpDatabase: async ({ outputPath }) => {
        dumpNumber += 1
        await writeFile(outputPath, `database dump ${dumpNumber}`)
      },
      restoreDatabase: async ({ inputPath }) => {
        restoredSql = await readFile(inputPath, 'utf8')
      },
    })

    const backupJob = await manager.startBackup()
    const completedBackup = await waitForJob(manager, backupJob.id)
    assert.ok(completedBackup.fileName)
    assert.equal((await manager.listBackups()).length, 1)

    await writeFile(path.join(uploads, 'original.jpg'), 'imagen modificada')
    await writeFile(path.join(uploads, 'extra.jpg'), 'imagen nueva')
    await writeFile(path.join(proofs, 'original.pdf'), 'comprobante modificado')

    const restoreJob = await manager.startRestoreFromFile(completedBackup.fileName)
    const completedRestore = await waitForJob(manager, restoreJob.id)
    assert.ok(completedRestore.safetyBackupFileName)
    assert.equal(await readFile(path.join(uploads, 'original.jpg'), 'utf8'), 'imagen original')
    await assert.rejects(readFile(path.join(uploads, 'extra.jpg')), /ENOENT/)
    assert.equal(await readFile(path.join(proofs, 'original.pdf'), 'utf8'), 'comprobante original')
    assert.equal(restoredSql, 'database dump 1')
    assert.equal((await manager.listBackups()).length, 2)
    assert.equal(manager.isMaintenanceMode(), false)

    // El mismo backup descargado también puede volver por la ruta de carga
    // fragmentada que usa el navegador.
    const backupBytes = await readFile(path.join(backups, completedBackup.fileName))
    const totalChunks = Math.ceil(backupBytes.length / manager.chunkBytes)
    const upload = await manager.initializeUpload({
      fileName: completedBackup.fileName,
      totalSize: backupBytes.length,
      totalChunks,
    })
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * manager.chunkBytes
      await manager.writeUploadChunk(upload.id, index, backupBytes.subarray(start, Math.min(backupBytes.length, start + manager.chunkBytes)))
    }
    assert.equal((await manager.uploadStatus(upload.id)).receivedChunks, totalChunks)
    await writeFile(path.join(uploads, 'original.jpg'), 'tercera versión')
    const uploadedRestore = await manager.startRestoreFromUpload(upload.id)
    await waitForJob(manager, uploadedRestore.id)
    assert.equal(await readFile(path.join(uploads, 'original.jpg'), 'utf8'), 'imagen original')
    assert.equal(manager.isMaintenanceMode(), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('si PostgreSQL falla, revierte el intercambio de archivos y sale de mantenimiento', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-rollback-'))
  const backups = path.join(root, 'backups')
  const uploads = path.join(root, 'uploads')
  const proofs = path.join(root, 'proofs')

  try {
    await mkdir(backups)
    await mkdir(uploads)
    await mkdir(proofs)
    await writeFile(path.join(uploads, 'image.jpg'), 'estado respaldado')
    await writeFile(path.join(proofs, 'proof.pdf'), 'comprobante respaldado')

    const manager = new BackupManager({
      backupsDir: backups,
      uploadsDir: uploads,
      transferProofsDir: proofs,
      secret: 'rollback-test-secret-with-more-than-thirty-two-characters',
      databaseUrl: 'postgresql://test/database',
      readCommandVersion: async command => ({ available: true, version: `${command} 1` }),
      dumpDatabase: async ({ outputPath }) => writeFile(outputPath, 'database dump'),
      restoreDatabase: async () => { throw new Error('fallo controlado de PostgreSQL') },
    })

    const backupJob = await manager.startBackup()
    const backup = await waitForJob(manager, backupJob.id)
    await writeFile(path.join(uploads, 'image.jpg'), 'estado actual que debe conservarse')
    await writeFile(path.join(proofs, 'proof.pdf'), 'comprobante actual')

    const restoreJob = await manager.startRestoreFromFile(backup.fileName)
    await assert.rejects(waitForJob(manager, restoreJob.id), /fallo controlado/)
    const failed = manager.getJob(restoreJob.id)

    assert.equal(failed.status, 'failed')
    assert.ok(failed.safetyBackupFileName)
    assert.equal(await readFile(path.join(uploads, 'image.jpg'), 'utf8'), 'estado actual que debe conservarse')
    assert.equal(await readFile(path.join(proofs, 'proof.pdf'), 'utf8'), 'comprobante actual')
    assert.equal(manager.isMaintenanceMode(), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restaura y revierte archivos aunque Windows no permita renombrar la carpeta activa', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fenix-backup-copy-fallback-'))
  const backups = path.join(root, 'backups')
  const uploads = path.join(root, 'uploads')
  const proofs = path.join(root, 'proofs')

  try {
    await mkdir(backups)
    await mkdir(uploads)
    await mkdir(proofs)
    await writeFile(path.join(uploads, 'image.jpg'), 'estado respaldado')
    await writeFile(path.join(proofs, 'proof.pdf'), 'comprobante respaldado')

    const manager = new BackupManager({
      backupsDir: backups,
      uploadsDir: uploads,
      transferProofsDir: proofs,
      secret: 'copy-fallback-secret-with-more-than-thirty-two-characters',
      databaseUrl: 'postgresql://test/database',
      readCommandVersion: async command => ({ available: true, version: `${command} 1` }),
      dumpDatabase: async ({ outputPath }) => writeFile(outputPath, 'database dump'),
      restoreDatabase: async () => {
        assert.equal(await readFile(path.join(uploads, 'image.jpg'), 'utf8'), 'estado respaldado')
        assert.equal(await readFile(path.join(proofs, 'proof.pdf'), 'utf8'), 'comprobante respaldado')
        throw new Error('fallo posterior controlado')
      },
      moveDirectory: async () => {
        const error = new Error('directorio bloqueado por Windows')
        error.code = 'EPERM'
        throw error
      },
    })

    const backupJob = await manager.startBackup()
    const backup = await waitForJob(manager, backupJob.id)
    await writeFile(path.join(uploads, 'image.jpg'), 'estado actual preservado')
    await writeFile(path.join(proofs, 'proof.pdf'), 'comprobante actual preservado')

    // La prueba funcional anterior cubre rename. Aquí forzamos EPERM y
    // verificamos que el rollback conserve los datos actuales.
    const restoreJob = await manager.startRestoreFromFile(backup.fileName)
    await assert.rejects(waitForJob(manager, restoreJob.id), /fallo posterior controlado/)
    assert.equal(await readFile(path.join(uploads, 'image.jpg'), 'utf8'), 'estado actual preservado')
    assert.equal(await readFile(path.join(proofs, 'proof.pdf'), 'utf8'), 'comprobante actual preservado')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
