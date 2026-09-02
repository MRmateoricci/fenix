import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { attachUserIfPresent } from '../middleware/requireAuth.js'
import { countCustomerCouponUses, evaluateCoupon, findCouponByCode } from '../services/coupons.js'

const router = Router()

// Pública: el checkout la usa para validar el código y calcular el
// descuento antes de mandarlo a POST /api/orders (que vuelve a validarlo
// contra la DB — nunca se confía en el monto que calculó el navegador).
router.post('/validate', attachUserIfPresent, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim()
    const subtotal = Number(req.body?.subtotal)
    if (!code) return res.status(400).json({ error: 'Ingresá un código' })
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return res.status(400).json({ error: 'Subtotal inválido' })
    }

    const coupon = await findCouponByCode(code)

    // Pre-chequeo del tope por cliente solo si el visitante está autenticado:
    // usamos el email/DNI de su cuenta, así este endpoint público no sirve para
    // sondear si un correo ajeno ya usó un cupón. Al invitado se lo valida
    // recién en POST /api/orders, contra su propio email.
    let customerPriorUses = 0
    if (coupon?.per_customer_limit != null && req.userId) {
      const { rows } = await pool.query('SELECT email, dni FROM users WHERE id = $1', [req.userId])
      if (rows.length) {
        customerPriorUses = await countCustomerCouponUses(
          coupon.code, { email: rows[0].email, dni: rows[0].dni },
        )
      }
    }

    const result = evaluateCoupon(coupon, subtotal, { customerPriorUses })
    if (result.error) return res.status(400).json({ error: result.error })

    res.json({
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      discountAmount: result.amount,
    })
  } catch (err) {
    console.error('[POST /api/coupons/validate]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ── Admin: gestión de cupones ────────────────────────────────────────────────
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC')
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/coupons]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

function parseOptionalNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

router.post('/', requireAdmin, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase()
    const type = req.body?.type
    const value = Number(req.body?.value)
    const minPurchase = parseOptionalNumber(req.body?.minPurchase)
    const usageLimit = parseOptionalNumber(req.body?.usageLimit)
    const perCustomerLimit = parseOptionalNumber(req.body?.perCustomerLimit)
    const expiresAt = req.body?.expiresAt || null
    const active = req.body?.active !== false

    if (!code || code.length > 40) return res.status(400).json({ error: 'Código inválido' })
    if (!['percentage', 'fixed'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' })
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'El valor debe ser mayor a 0' })
    if (type === 'percentage' && value > 100) return res.status(400).json({ error: 'El porcentaje no puede superar 100' })
    if (Number.isNaN(minPurchase) || (minPurchase != null && minPurchase < 0)) {
      return res.status(400).json({ error: 'Compra mínima inválida' })
    }
    if (Number.isNaN(usageLimit) || (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit <= 0))) {
      return res.status(400).json({ error: 'Límite de usos inválido' })
    }
    if (Number.isNaN(perCustomerLimit) || (perCustomerLimit != null && (!Number.isInteger(perCustomerLimit) || perCustomerLimit <= 0))) {
      return res.status(400).json({ error: 'Límite por cliente inválido' })
    }

    const { rows } = await pool.query(
      `INSERT INTO coupons (code, type, value, active, min_purchase, usage_limit, per_customer_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [code, type, value, active, minPurchase, usageLimit, perCustomerLimit, expiresAt]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cupón con ese código' })
    console.error('[POST /api/coupons]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const fields = []
    const params = []
    let idx = 1

    if ('code' in req.body) {
      const code = String(req.body.code || '').trim().toUpperCase()
      if (!code || code.length > 40) return res.status(400).json({ error: 'Código inválido' })
      fields.push(`code = $${idx++}`); params.push(code)
    }
    if ('type' in req.body) {
      if (!['percentage', 'fixed'].includes(req.body.type)) return res.status(400).json({ error: 'Tipo inválido' })
      fields.push(`type = $${idx++}`); params.push(req.body.type)
    }
    if ('value' in req.body) {
      const value = Number(req.body.value)
      if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'El valor debe ser mayor a 0' })
      fields.push(`value = $${idx++}`); params.push(value)
    }
    if ('active' in req.body) {
      fields.push(`active = $${idx++}`); params.push(!!req.body.active)
    }
    if ('minPurchase' in req.body) {
      const minPurchase = parseOptionalNumber(req.body.minPurchase)
      if (Number.isNaN(minPurchase) || (minPurchase != null && minPurchase < 0)) {
        return res.status(400).json({ error: 'Compra mínima inválida' })
      }
      fields.push(`min_purchase = $${idx++}`); params.push(minPurchase)
    }
    if ('usageLimit' in req.body) {
      const usageLimit = parseOptionalNumber(req.body.usageLimit)
      if (Number.isNaN(usageLimit) || (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit <= 0))) {
        return res.status(400).json({ error: 'Límite de usos inválido' })
      }
      fields.push(`usage_limit = $${idx++}`); params.push(usageLimit)
    }
    if ('perCustomerLimit' in req.body) {
      const perCustomerLimit = parseOptionalNumber(req.body.perCustomerLimit)
      if (Number.isNaN(perCustomerLimit) || (perCustomerLimit != null && (!Number.isInteger(perCustomerLimit) || perCustomerLimit <= 0))) {
        return res.status(400).json({ error: 'Límite por cliente inválido' })
      }
      fields.push(`per_customer_limit = $${idx++}`); params.push(perCustomerLimit)
    }
    if ('expiresAt' in req.body) {
      fields.push(`expires_at = $${idx++}`); params.push(req.body.expiresAt || null)
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' })

    params.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE coupons SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Cupón no encontrado' })
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cupón con ese código' })
    console.error('[PATCH /api/coupons/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM coupons WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'Cupón no encontrado' })
    res.status(204).end()
  } catch (err) {
    console.error('[DELETE /api/coupons/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
