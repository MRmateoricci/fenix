const { prisma } = require('../database');

const INSTAGRAM_LIMITS = {
  MAX_POSTS_PER_DAY: 25,
  MAX_POSTS_PER_HOUR: 3,
  MAX_HASHTAGS: 30,
  MIN_POST_INTERVAL_MINUTES: 20,
};

const FACEBOOK_LIMITS = {
  MAX_POSTS_PER_DAY: 10,
  MAX_POSTS_PER_HOUR: 2,
  MIN_POST_INTERVAL_MINUTES: 30,
};

async function validateAntiSpam(accountId, scheduledAt, platforms = ['instagram']) {
  const warnings = [];
  const errors = [];

  const scheduledDate = new Date(scheduledAt);
  const dayStart = new Date(scheduledDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledDate); dayEnd.setHours(23, 59, 59, 999);
  const hourStart = new Date(scheduledDate); hourStart.setMinutes(0, 0, 0);
  const hourEnd = new Date(scheduledDate); hourEnd.setMinutes(59, 59, 999);

  for (const platform of platforms) {
    const limits = platform === 'facebook' ? FACEBOOK_LIMITS : INSTAGRAM_LIMITS;

    // Posts ese día
    const dayCount = await prisma.post.count({
      where: {
        accountId: parseInt(accountId),
        status: { in: ['scheduled', 'published'] },
        OR: [
          { scheduledAt: { gte: dayStart, lte: dayEnd } },
          { publishedAt: { gte: dayStart, lte: dayEnd } },
        ],
        platforms: { contains: platform },
      },
    });

    if (dayCount >= limits.MAX_POSTS_PER_DAY) {
      errors.push(`Límite diario alcanzado para ${platform}: ${dayCount}/${limits.MAX_POSTS_PER_DAY} posts`);
    } else if (dayCount >= limits.MAX_POSTS_PER_DAY * 0.8) {
      warnings.push(`Cerca del límite diario de ${platform}: ${dayCount}/${limits.MAX_POSTS_PER_DAY} posts`);
    }

    // Posts esa hora
    const hourCount = await prisma.post.count({
      where: {
        accountId: parseInt(accountId),
        status: { in: ['scheduled', 'published'] },
        OR: [
          { scheduledAt: { gte: hourStart, lte: hourEnd } },
          { publishedAt: { gte: hourStart, lte: hourEnd } },
        ],
        platforms: { contains: platform },
      },
    });

    if (hourCount >= limits.MAX_POSTS_PER_HOUR) {
      errors.push(`Demasiadas publicaciones en 1 hora para ${platform}: ${hourCount}/${limits.MAX_POSTS_PER_HOUR}`);
    }
  }

  const valid = errors.length === 0;
  const risk = errors.length > 0 ? 'high' : warnings.length > 0 ? 'medium' : 'low';

  return {
    valid,
    risk,
    errors,
    warnings,
    message: errors[0] || warnings[0] || 'Sin problemas detectados',
  };
}

function validateHashtags(hashtags) {
  const issues = [];
  if (!hashtags || !Array.isArray(hashtags)) return { valid: true, issues: [] };

  if (hashtags.length > INSTAGRAM_LIMITS.MAX_HASHTAGS) {
    issues.push(`Demasiados hashtags: ${hashtags.length}/${INSTAGRAM_LIMITS.MAX_HASHTAGS} máximo`);
  }
  if (hashtags.length > 20) {
    issues.push('Más de 20 hashtags puede reducir el alcance orgánico (recomendado: 5-15)');
  }

  return {
    valid: !issues.some(i => i.includes('Demasiados')),
    issues,
    count: hashtags.length,
  };
}

module.exports = { validateAntiSpam, validateHashtags, INSTAGRAM_LIMITS, FACEBOOK_LIMITS };
