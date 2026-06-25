const express = require('express');
const router = express.Router();
const { prisma } = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../services/metaService');

// Filtro de cuentas según el rol del usuario
function accountFilter(user) {
  return user.role === 'admin' ? {} : { userId: user.id };
}

// GET /api/accounts
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const where = accountFilter(req.user);
  const accounts = await prisma.account.findMany({ where, orderBy: { createdAt: 'desc' } });

  const enriched = await Promise.all(accounts.map(async a => {
    const [published, scheduled] = await Promise.all([
      prisma.post.count({ where: { accountId: a.id, status: 'published' } }),
      prisma.post.count({ where: { accountId: a.id, status: 'scheduled' } }),
    ]);
    return { ...flattenAccount(a), total_published: published, total_scheduled: scheduled };
  }));

  res.json({ accounts: enriched });
}));

// GET /api/accounts/:id
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const where = { id: parseInt(req.params.id), ...accountFilter(req.user) };
  const account = await prisma.account.findFirst({ where });
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(flattenAccount(account));
}));

// POST /api/accounts
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, platform, username, page_id, access_token, avatar_color } = req.body;

  if (!name || !platform) return res.status(400).json({ error: 'Nombre y plataforma son requeridos' });
  if (!['instagram', 'facebook'].includes(platform)) return res.status(400).json({ error: 'Plataforma inválida' });

  const colors = ['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const status = access_token ? 'connected' : 'disconnected';

  const account = await prisma.account.create({
    data: {
      userId: req.user.id,
      name,
      platform,
      username: username || null,
      pageId: page_id || null,
      accessToken: access_token || null,
      status,
      avatarColor: avatar_color || randomColor,
    },
  });

  res.status(201).json(flattenAccount(account));
}));

// PUT /api/accounts/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.account.findFirst({ where: { id, ...accountFilter(req.user) } });
  if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const { name, username, page_id, access_token, status, followers } = req.body;

  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(username !== undefined && { username }),
      ...(page_id !== undefined && { pageId: page_id }),
      ...(access_token !== undefined && { accessToken: access_token }),
      ...(status !== undefined && { status }),
      ...(followers !== undefined && { followers: parseInt(followers) }),
    },
  });

  res.json(flattenAccount(updated));
}));

// DELETE /api/accounts/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.account.findFirst({ where: { id, ...accountFilter(req.user) } });
  if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });

  await prisma.account.delete({ where: { id } });
  res.json({ message: 'Cuenta desconectada y eliminada' });
}));

// POST /api/accounts/:id/verify
router.post('/:id/verify', requireAuth, asyncHandler(async (req, res) => {
  const account = await prisma.account.findFirst({
    where: { id: parseInt(req.params.id), ...accountFilter(req.user) }
  });
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

  if (!account.accessToken) {
    return res.json({ valid: false, message: 'No hay token de acceso configurado para esta cuenta' });
  }
  const result = await verifyToken(account.accessToken);
  res.json(result);
}));

function flattenAccount(a) {
  return {
    ...a,
    page_id: a.pageId,
    access_token: a.accessToken ? '***' : null,
    avatar_color: a.avatarColor,
    created_at: a.createdAt?.toISOString?.() || a.createdAt,
    updated_at: a.updatedAt?.toISOString?.() || a.updatedAt,
  };
}

module.exports = router;
