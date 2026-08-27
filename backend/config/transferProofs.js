import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Nunca debe quedar dentro de uploadsDir: esa carpeta se sirve publicamente.
export const transferProofsDir = process.env.TRANSFER_PROOFS_DIR
  ? path.resolve(process.env.TRANSFER_PROOFS_DIR)
  : path.join(__dirname, '..', 'private', 'transfer-proofs')

mkdirSync(transferProofsDir, { recursive: true })
