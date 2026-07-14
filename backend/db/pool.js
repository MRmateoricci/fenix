import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import 'dotenv/config'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err)
})

export async function runSchema() {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(path.join(dir, 'schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('Schema aplicado correctamente.')
  await pool.end()
}
