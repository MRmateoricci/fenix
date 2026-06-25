const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'socialpilot_secret_key';

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  res.json({ token: makeToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// POST /api/auth/register — registro abierto para creadores
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Email, nombre y contraseña son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), name, password: hashed, role: 'creator' }
  });

  res.status(201).json({ token: makeToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true }
  });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

// GET /api/auth/users — solo admin
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, createdAt: true,
      _count: { select: { accounts: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users);
});

// DELETE /api/auth/users/:id — solo admin
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.role === 'admin') return res.status(400).json({ error: 'No se puede eliminar al admin' });
  await prisma.user.delete({ where: { id } });
  res.json({ success: true });
});

module.exports = router;
