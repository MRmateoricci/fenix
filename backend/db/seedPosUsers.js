// Crea el usuario admin inicial del POS de mostrador.
//   node db/seedPosUsers.js
//
// Idempotente: si "admin" ya existe no lo toca (no pisa una contraseña que
// Fara ya haya cambiado).
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './pool.js'

const USERNAME = 'admin'
const TEMP_PASSWORD = 'admin123'

async function main() {
  const { rows } = await pool.query(`SELECT id FROM pos_users WHERE username = $1`, [USERNAME])
  if (rows.length) {
    console.log(`El usuario "${USERNAME}" ya existe, no se modifica.`)
  } else {
    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10)
    await pool.query(
      `INSERT INTO pos_users (username, password_hash, name, role)
       VALUES ($1, $2, 'Administrador', 'admin')`,
      [USERNAME, passwordHash]
    )
    console.log(`Usuario POS creado: "${USERNAME}" / "${TEMP_PASSWORD}" (cambiarla después del primer login).`)
  }
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
