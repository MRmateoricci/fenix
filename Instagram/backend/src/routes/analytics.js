const express = require('express');
const router = express.Router();
const { prisma } = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/analytics/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const [total, scheduled, published, failed, drafts] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { status: 'scheduled' } }),
    prisma.post.count({ where: { status: 'published' } }),
    prisma.post.count({ where: { status: 'failed' } }),
    prisma.post.count({ where: { status: 'draft' } }),
  ]);

  // Publicaciones de los últimos 7 días
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPublished = await prisma.post.findMany({
    where: { status: 'published', publishedAt: { gte: sevenDaysAgo } },
    select: { publishedAt: true },
  });

  // Agrupar por día
  const dayMap = {};
  recentPublished.forEach(p => {
    if (!p.publishedAt) return;
    const day = p.publishedAt.toISOString().split('T')[0];
    dayMap[day] = (dayMap[day] || 0) + 1;
  });
  const last7Days = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Stats por plataforma
  const accounts = await prisma.account.findMany({ select: { platform: true, status: true } });
  const platformMap = {};
  accounts.forEach(a => {
    if (!platformMap[a.platform]) platformMap[a.platform] = { platform: a.platform, count: 0, connected: 0 };
    platformMap[a.platform].count++;
    if (a.status === 'connected') platformMap[a.platform].connected++;
  });

  res.json({
    overview: { total, scheduled, published, failed, drafts },
    last7Days,
    accountStats: Object.values(platformMap),
  });
}));

// GET /api/analytics/optimal-times
router.get('/optimal-times', asyncHandler(async (req, res) => {
  const { niche = 'general' } = req.query;

  res.json({
    niche,
    source: 'Basado en estudios de algoritmos 2024-2025',
    disclaimer: 'Conectá tus métricas de Meta para obtener datos personalizados',
    schedule: getOptimalTimes(niche),
    instagram_tips: [
      'Publicá en los momentos de mayor actividad de tu audiencia',
      'La consistencia (mismos días/horarios) mejora el alcance orgánico',
      'Reels tienen 2x más alcance que posts estáticos en 2025',
      'Stories entre semana tienen mejor engagement que fines de semana',
    ],
    facebook_tips: [
      'El mejor horario en Facebook es entre 13h y 15h en días de semana',
      'Los jueves y viernes tienen el mayor engagement',
      'Los videos nativos tienen 6x más alcance que links externos',
    ],
  });
}));

// GET /api/analytics/calendar
router.get('/calendar', asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year || new Date().getFullYear());
  const m = parseInt(month || (new Date().getMonth() + 1));

  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 0, 23, 59, 59);

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { scheduledAt: { gte: startDate, lte: endDate } },
        { publishedAt: { gte: startDate, lte: endDate } },
      ],
    },
    include: {
      account: { select: { name: true, username: true, avatarColor: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const byDay = {};
  posts.forEach(post => {
    const date = (post.scheduledAt || post.publishedAt);
    if (!date) return;
    const dateStr = date.toISOString().split('T')[0];
    if (!byDay[dateStr]) byDay[dateStr] = [];
    byDay[dateStr].push({
      id: post.id,
      caption: post.caption,
      image_url: post.imageUrl,
      scheduled_at: post.scheduledAt?.toISOString(),
      published_at: post.publishedAt?.toISOString(),
      status: post.status,
      platforms: safeParseJSON(post.platforms, []),
      account_name: post.account?.name,
      username: post.account?.username,
      avatar_color: post.account?.avatarColor,
    });
  });

  res.json({ year: y, month: m, byDay });
}));

function getOptimalTimes(niche) {
  const base = {
    lunes:    { instagram: ['08:00', '12:00', '19:00'], facebook: ['13:00', '18:00'] },
    martes:   { instagram: ['09:00', '13:00', '20:00'], facebook: ['14:00', '19:00'] },
    miercoles:{ instagram: ['09:00', '12:00', '19:00'], facebook: ['13:00', '15:00'] },
    jueves:   { instagram: ['08:00', '12:00', '18:00'], facebook: ['14:00', '20:00'] },
    viernes:  { instagram: ['09:00', '14:00', '21:00'], facebook: ['13:00', '16:00'] },
    sabado:   { instagram: ['10:00', '14:00', '20:00'], facebook: ['12:00', '18:00'] },
    domingo:  { instagram: ['11:00', '15:00', '19:00'], facebook: ['13:00', '17:00'] },
  };

  const adjustments = {
    fitness:     { best_days: ['lunes', 'miercoles', 'viernes'], peak: '06:00-08:00' },
    gastronomia: { best_days: ['miercoles', 'jueves', 'viernes'], peak: '11:00-13:00' },
    moda:        { best_days: ['martes', 'jueves', 'sabado'], peak: '18:00-20:00' },
    tecnologia:  { best_days: ['martes', 'miercoles', 'jueves'], peak: '09:00-11:00' },
    lifestyle:   { best_days: ['lunes', 'miercoles', 'sabado'], peak: '08:00-10:00' },
    general:     { best_days: ['martes', 'miercoles', 'jueves'], peak: '12:00-14:00' },
  };

  return { weekly: base, niche_specific: adjustments[niche.toLowerCase()] || adjustments.general };
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
