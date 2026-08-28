import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import 'dotenv/config'
import { uploadsDir } from './uploads.js'
import { transferProofsDir } from './transferProofs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const backupsDir = process.env.BACKUPS_DIR
  ? path.resolve(process.env.BACKUPS_DIR)
  : path.join(__dirname, '..', 'private', 'backups')

export const backupEncryptionSecret = process.env.BACKUP_ENCRYPTION_KEY?.trim() || ''
export const pgDumpPath = process.env.PG_DUMP_PATH?.trim() || 'pg_dump'
export const psqlPath = process.env.PSQL_PATH?.trim() || 'psql'
export const backupChunkBytes = 8 * 1024 * 1024
export const backupMaxUploadBytes = Math.max(
  64 * 1024 * 1024,
  Number(process.env.BACKUP_MAX_UPLOAD_BYTES) || 10 * 1024 * 1024 * 1024,
)

function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function pathsOverlap(left, right) {
  return containsPath(left, right) || containsPath(right, left)
}

if (pathsOverlap(backupsDir, uploadsDir) || pathsOverlap(backupsDir, transferProofsDir)) {
  throw new Error('BACKUPS_DIR debe estar fuera de UPLOADS_DIR y TRANSFER_PROOFS_DIR')
}

if (pathsOverlap(uploadsDir, transferProofsDir)) {
  throw new Error('TRANSFER_PROOFS_DIR debe estar fuera de UPLOADS_DIR')
}

mkdirSync(backupsDir, { recursive: true })
mkdirSync(path.join(backupsDir, '.incoming'), { recursive: true })
mkdirSync(path.join(backupsDir, '.work'), { recursive: true })
