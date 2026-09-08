// Script puntual: crea cuentas de cliente de ejemplo para ver la sección
// "Cuentas" del panel con datos. NO forma parte del arranque del backend.
//
//   node db/seedDemoCustomers.js          → inserta las cuentas demo
//   node db/seedDemoCustomers.js --clean  → borra todo lo que creó este script
//
// Todo lo demo usa el dominio de email `demo.fenix.test` y pedidos con número
// `DEMO-C-*`, así que el limpiado es exacto y no toca datos reales.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './pool.js'

const DEMO_DOMAIN = 'demo.fenix.test'
const DEMO_PASSWORD = 'demo1234' // por si se quiere iniciar sesión como la cuenta

const daysAgoISO = (days) => new Date(Date.now() - days * 86_400_000).toISOString()

// verified/newsletter: banderas · orders: [{ number, total, status, daysAgo, paid }]
// favorites: cuántos productos publicados marcar como favoritos (best-effort).
// A propósito NO se siembran reseñas: son públicas y ensuciarían la ficha real
// del producto en la tienda.
const CUSTOMERS = [
  {
    email: `ana.garcia@${DEMO_DOMAIN}`,
    firstName: 'Ana', lastName: 'García',
    phone: '221 555-0110',
    address: 'Calle 470 nº 1234', city: 'City Bell', postalCode: '1896',
    createdAt: '2026-02-11T14:20:00.000Z',
    verified: true, newsletter: true,
    orders: [
      { number: 'DEMO-C-0001', total: 48500, status: 'delivered',        daysAgo: 130, paid: true },
      { number: 'DEMO-C-0002', total: 15900, status: 'paid',             daysAgo: 18,  paid: true },
      { number: 'DEMO-C-0003', total: 7200,  status: 'pending_payment',  daysAgo: 2,   paid: false },
    ],
    favorites: 2,
  },
  {
    email: `bruno.perez@${DEMO_DOMAIN}`,
    firstName: 'Bruno', lastName: 'Pérez',
    phone: '221 555-0142',
    address: 'Av. 44 nº 890', city: 'La Plata', postalCode: '1900',
    createdAt: '2026-04-03T10:05:00.000Z',
    verified: true, newsletter: false,
    orders: [
      { number: 'DEMO-C-0004', total: 132400, status: 'shipped', daysAgo: 9, paid: true },
    ],
    favorites: 1,
  },
  {
    email: `carla.gomez@${DEMO_DOMAIN}`,
    firstName: 'Carla', lastName: 'Gómez',
    phone: null, address: null, city: null, postalCode: null,
    createdAt: daysAgoISO(3),
    verified: false, newsletter: false,
    orders: [],
    favorites: 0,
  },
  {
    email: `diego.fernandez@${DEMO_DOMAIN}`,
    firstName: 'Diego', lastName: 'Fernández',
    phone: '11 6555-2280',
    address: 'Calle 14 nº 55', city: 'Berazategui', postalCode: '1884',
    createdAt: '2026-05-20T18:40:00.000Z',
    verified: true, newsletter: true,
    orders: [
      { number: 'DEMO-C-0005', total: 23900, status: 'paid',      daysAgo: 40, paid: true },
      { number: 'DEMO-C-0006', total: 9800,  status: 'cancelled', daysAgo: 12, paid: false },
    ],
    favorites: 0,
  },
  {
    email: `elena.ruiz@${DEMO_DOMAIN}`,
    firstName: 'Elena', lastName: 'Ruiz',
    phone: '221 555-0199',
    address: 'Calle 12 nº 3400', city: 'Quilmes', postalCode: '1878',
    createdAt: '2026-06-28T09:15:00.000Z',
    verified: true, newsletter: true,
    orders: [],
    favorites: 3,
  },
  {
    email: `franco.diaz@${DEMO_DOMAIN}`,
    firstName: 'Franco', lastName: 'Díaz',
    phone: null,
    address: null, city: 'Ensenada', postalCode: null,
    createdAt: daysAgoISO(16),
    verified: false, newsletter: false,
    orders: [],
    favorites: 0,
  },
]

async function clean() {
  const like = `%@${DEMO_DOMAIN}`
  // favorites y reviews caen por ON DELETE CASCADE al borrar el usuario;
  // los pedidos quedan con user_id = NULL (ON DELETE SET NULL), así que van aparte.
  const orders = await pool.query(`DELETE FROM orders WHERE order_number LIKE 'DEMO-C-%'`)
  const news = await pool.query(`DELETE FROM newsletter_subscribers WHERE email LIKE $1`, [like])
  const users = await pool.query(`DELETE FROM users WHERE email LIKE $1`, [like])
  console.log(`Limpiado: ${users.rowCount} cuentas, ${orders.rowCount} pedidos, ${news.rowCount} suscripciones.`)
}

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  // Productos publicados para enganchar favoritos/reseñas (best-effort).
  const { rows: prods } = await pool.query(
    `SELECT id FROM products WHERE published = true ORDER BY created_at LIMIT 5`
  )
  const productIds = prods.map(r => r.id)
  if (productIds.length === 0) {
    console.log('Sin productos publicados: se omiten favoritos y reseñas.')
  }

  for (const c of CUSTOMERS) {
    const { rows } = await pool.query(
      `INSERT INTO users (
         email, password_hash, first_name, last_name, phone,
         address, city, postal_code, email_verified_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [
        c.email, passwordHash, c.firstName, c.lastName, c.phone ?? null,
        c.address ?? null, c.city ?? null, c.postalCode ?? null,
        c.verified ? c.createdAt : null, c.createdAt,
      ]
    )
    const userId = rows[0].id

    for (const o of c.orders) {
      const createdAt = daysAgoISO(o.daysAgo)
      await pool.query(
        `INSERT INTO orders (
           order_number, status, customer_name, customer_email, customer_phone,
           delivery_type, total_amount, items, user_id, payment_method,
           created_at, paid_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'mercadopago',$10,$11)
         ON CONFLICT (order_number) DO NOTHING`,
        [
          o.number, o.status, `${c.firstName} ${c.lastName}`, c.email, c.phone ?? '0000000000',
          'delivery', o.total,
          JSON.stringify([{ name: 'Producto de ejemplo', quantity: 1, price: o.total }]),
          userId, createdAt, o.paid ? createdAt : null,
        ]
      )
    }

    for (let i = 0; i < Math.min(c.favorites || 0, productIds.length); i++) {
      await pool.query(
        `INSERT INTO favorites (user_id, product_id) VALUES ($1,$2)
         ON CONFLICT (user_id, product_id) DO NOTHING`,
        [userId, productIds[i]]
      )
    }

    if (c.newsletter) {
      await pool.query(
        `INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
        [c.email]
      )
    }

    console.log('OK', c.email, `(${c.orders.length} pedido/s)`)
  }
}

async function main() {
  const mode = process.argv.includes('--clean') ? 'clean' : 'seed'
  if (mode === 'clean') await clean()
  else {
    await seed()
    console.log(`\nListo. ${CUSTOMERS.length} cuentas demo. Contraseña de todas: "${DEMO_PASSWORD}".`)
    console.log('Para borrarlas: node db/seedDemoCustomers.js --clean')
  }
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
