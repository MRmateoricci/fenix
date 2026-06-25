const express = require('express');
const router = express.Router();
const { prisma } = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/logs
router.get('/', asyncHandler(async (req, res) => {
  const { level, limit = '50', offset = '0' } = req.query;

  const where = level ? { level } : {};

  const [logs, total] = await Promise.all([
    prisma.postLog.findMany({
      where,
      include: {
        post: {
          select: {
            caption: true,
            imageUrl: true,
            status: true,
            account: { select: { name: true, username: true, platform: true, avatarColor: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    }),
    prisma.postLog.count({ where }),
  ]);

  const flattened = logs.map(log => ({
    id: log.id,
    post_id: log.postId,
    action: log.action,
    message: log.message,
    level: log.level,
    created_at: log.createdAt?.toISOString?.() || log.createdAt,
    caption: log.post?.caption || null,
    image_url: log.post?.imageUrl || null,
    post_status: log.post?.status || null,
    account_name: log.post?.account?.name || null,
    username: log.post?.account?.username || null,
    platform: log.post?.account?.platform || null,
    avatar_color: log.post?.account?.avatarColor || null,
  }));

  res.json({ logs: flattened, total });
}));

// DELETE /api/logs/cleanup
router.delete('/cleanup', asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.postLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } });
  res.json({ message: `${result.count} logs eliminados`, deleted: result.count });
}));

module.exports = router;
