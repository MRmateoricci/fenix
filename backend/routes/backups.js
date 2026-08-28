import { Router, raw } from 'express'
import { backupChunkBytes } from '../config/backups.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { backupManager } from '../services/backupManager.js'
import { passwordsMatch } from '../utils/adminSecurity.js'

const router = Router()
const chunkBody = raw({ type: 'application/octet-stream', limit: backupChunkBytes })

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function requireDestructiveConfirmation(req, expectedWord) {
  const expectedPassword = process.env.ADMIN_SECRET
  if (!expectedPassword || !passwordsMatch(req.body?.password, expectedPassword)) {
    throw Object.assign(new Error('Contraseña administrativa incorrecta'), { status: 403 })
  }
  if (String(req.body?.confirmation || '').trim().toUpperCase() !== expectedWord) {
    throw Object.assign(new Error(`Escribí ${expectedWord} para confirmar`), { status: 400 })
  }
}

router.use(requireAdmin)
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

router.get('/', asyncRoute(async (_req, res) => {
  res.json(await backupManager.status())
}))

router.post('/', asyncRoute(async (_req, res) => {
  res.status(202).json(await backupManager.startBackup())
}))

router.get('/jobs/:jobId', asyncRoute(async (req, res) => {
  res.json(backupManager.getJob(req.params.jobId))
}))

router.get('/files/:fileName', asyncRoute(async (req, res) => {
  const filePath = backupManager.backupFilePath(req.params.fileName)
  res.set('Content-Type', 'application/octet-stream')
  res.set('Content-Disposition', `attachment; filename="${req.params.fileName}"`)
  res.sendFile(filePath)
}))

router.delete('/files/:fileName', asyncRoute(async (req, res) => {
  requireDestructiveConfirmation(req, 'ELIMINAR')
  await backupManager.deleteBackup(req.params.fileName)
  res.status(204).end()
}))

router.post('/files/:fileName/restore', asyncRoute(async (req, res) => {
  requireDestructiveConfirmation(req, 'RESTAURAR')
  res.status(202).json(await backupManager.startRestoreFromFile(req.params.fileName))
}))

router.post('/restore-uploads', asyncRoute(async (req, res) => {
  requireDestructiveConfirmation(req, 'RESTAURAR')
  const upload = await backupManager.initializeUpload(req.body || {})
  res.status(201).json(upload)
}))

router.get('/restore-uploads/:uploadId', asyncRoute(async (req, res) => {
  res.json(await backupManager.uploadStatus(req.params.uploadId))
}))

router.put('/restore-uploads/:uploadId/chunks/:index', chunkBody, asyncRoute(async (req, res) => {
  res.json(await backupManager.writeUploadChunk(req.params.uploadId, req.params.index, req.body))
}))

router.post('/restore-uploads/:uploadId/complete', asyncRoute(async (req, res) => {
  requireDestructiveConfirmation(req, 'RESTAURAR')
  res.status(202).json(await backupManager.startRestoreFromUpload(req.params.uploadId))
}))

export default router
