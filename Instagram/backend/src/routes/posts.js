const express = require('express');
const router = express.Router();
const { prisma } = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateAntiSpam } = require('../services/antiSpamService');
const { requireAuth } = require('../middleware/auth');

const includeAccount = {
  include: { account: { select: { name: true, username: true, platform: true, avatarColor: true } } },
};

// Construye el filtro de posts según rol (via account.userId)
async function postWhereFilter(user, extra = {}) {
  if (user.role === 'admin') return extra;
  // Obtener IDs de cuentas del usuario
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, select: { id: true } });
  const accountIds = accounts.map(a => a.id);
  return { ...extra, accountId: { in: accountIds } };
}

// GET /api/posts
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { status, account_id, limit = '50', offset = '0' } = req.query;

  const extra = {};
  if (status) extra.status = status;
  if (account_id) extra.accountId = parseInt(account_id);

  const where = await postWhereFilter(req.user, extra);

  const posts = await prisma.post.findMany({
    where,
    ...includeAccount,
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset),
  });

  res.json({ posts: posts.map(flattenPost), total: posts.length });
}));

// GET /api/posts/:id
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const post = await prisma.post.findUnique({
    where: { id },
    include: { account: true, logs: { orderBy: { createdAt: 'desc' } } },
  });
  if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });

  // Verificar acceso
  if (req.user.role !== 'admin' && post.account?.userId !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  res.json(flattenPost(post));
}));

// POST /api/posts
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { account_id, platforms, image_url, caption, hashtags, scheduled_at, tone, niche, prompt } = req.body;

  if (!caption && !image_url) {
    return res.status(400).json({ error: 'Se requiere al menos una imagen o un caption' });
  }

  // Verificar que la cuenta pertenece al usuario si es creator
  if (account_id && req.user.role !== 'admin') {
    const account = await prisma.account.findFirst({ where: { id: parseInt(account_id), userId: req.user.id } });
    if (!account) return res.status(403).json({ error: 'Cuenta no autorizada' });
  }

  if (scheduled_at && account_id) {
    const spamCheck = await validateAntiSpam(account_id, scheduled_at, platforms || ['instagram']);
    if (!spamCheck.valid) {
      return res.status(429).json({ error: spamCheck.message, risk: spamCheck.risk });
    }
  }

  const status = scheduled_at ? 'scheduled' : 'draft';

  const post = await prisma.post.create({
    data: {
      accountId: account_id ? parseInt(account_id) : null,
      platforms: JSON.stringify(platforms || []),
      imageUrl: image_url || null,
      caption: caption || null,
      hashtags: JSON.stringify(hashtags || []),
      scheduledAt: scheduled_at ? new Date(scheduled_at) : null,
      status,
      tone: tone || 'casual',
      niche: niche || 'general',
      prompt: prompt || null,
    },
  });

  await prisma.postLog.create({
    data: {
      postId: post.id,
      action: status === 'scheduled' ? 'SCHEDULED' : 'CREATED',
      message: status === 'scheduled'
        ? `Publicación programada para ${new Date(scheduled_at).toLocaleString('es-AR')}`
        : 'Borrador creado',
      level: 'info',
    },
  });

  res.status(201).json(flattenPost(post));
}));

// PUT /api/posts/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = await postWhereFilter(req.user, { id });
  const existing = await prisma.post.findFirst({ where });
  if (!existing) return res.status(404).json({ error: 'Publicación no encontrada' });

  const { account_id, platforms, image_url, caption, hashtags, scheduled_at, status, tone, niche } = req.body;

  const updated = await prisma.post.update({
    where: { id },
    data: {
      ...(account_id !== undefined && { accountId: account_id ? parseInt(account_id) : null }),
      ...(platforms !== undefined && { platforms: JSON.stringify(platforms) }),
      ...(image_url !== undefined && { imageUrl: image_url }),
      ...(caption !== undefined && { caption }),
      ...(hashtags !== undefined && { hashtags: JSON.stringify(hashtags) }),
      ...(scheduled_at !== undefined && { scheduledAt: scheduled_at ? new Date(scheduled_at) : null }),
      ...(status !== undefined && { status }),
      ...(tone !== undefined && { tone }),
      ...(niche !== undefined && { niche }),
    },
  });

  res.json(flattenPost(updated));
}));

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = await postWhereFilter(req.user, { id });
  const existing = await prisma.post.findFirst({ where });
  if (!existing) return res.status(404).json({ error: 'Publicación no encontrada' });

  await prisma.postLog.deleteMany({ where: { postId: id } });
  await prisma.post.delete({ where: { id } });
  res.json({ message: 'Publicación eliminada correctamente' });
}));

// POST /api/posts/:id/publish
router.post('/:id/publish', requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const where = await postWhereFilter(req.user, { id });
  const post = await prisma.post.findFirst({ where, include: { account: true } });
  if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });

  const { publishPost } = require('../services/metaService');
  const result = await publishPost(flattenPost(post));

  await prisma.post.update({
    where: { id },
    data: {
      status: result.success ? 'published' : 'failed',
      publishedAt: result.success ? new Date() : null,
      metaPostId: result.postId || null,
      errorMessage: result.success ? null : result.message,
    },
  });

  await prisma.postLog.create({
    data: {
      postId: id,
      action: result.success ? 'PUBLISHED' : 'FAILED',
      message: result.message,
      level: result.success ? 'success' : 'error',
    },
  });

  res.json({ success: result.success, message: result.message });
}));

function flattenPost(post) {
  const { account, ...rest } = post;
  return {
    ...rest,
    platforms: safeParseJSON(rest.platforms, []),
    hashtags: safeParseJSON(rest.hashtags, []),
    account_name: account?.name || null,
    account_username: account?.username || null,
    account_platform: account?.platform || null,
    avatar_color: account?.avatarColor || null,
    image_url: rest.imageUrl,
    account_id: rest.accountId,
    scheduled_at: rest.scheduledAt?.toISOString?.() || rest.scheduledAt,
    published_at: rest.publishedAt?.toISOString?.() || rest.publishedAt,
    created_at: rest.createdAt?.toISOString?.() || rest.createdAt,
    updated_at: rest.updatedAt?.toISOString?.() || rest.updatedAt,
    meta_post_id: rest.metaPostId,
    error_message: rest.errorMessage,
    retry_count: rest.retryCount,
  };
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
