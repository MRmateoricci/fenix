const cron = require('node-cron');
const { prisma } = require('../database');
const { publishPost } = require('./metaService');

let schedulerRunning = false;

function initScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  console.log('⏰ Scheduler de publicaciones iniciado (verifica cada minuto)');

  cron.schedule('* * * * *', async () => {
    await processScheduledPosts();
  });

  // Resetear posts que quedaron en "publishing" por un crash previo
  prisma.post.updateMany({
    where: {
      status: 'publishing',
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: 'scheduled' },
  }).catch(console.error);
}

async function processScheduledPosts() {
  const now = new Date();

  const pendingPosts = await prisma.post.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: now },
      retryCount: { lt: 3 },
    },
    include: {
      account: true,
    },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
  });

  if (pendingPosts.length === 0) return;

  console.log(`📬 Procesando ${pendingPosts.length} publicación(es) programada(s)...`);

  for (const post of pendingPosts) {
    await processPost(post);
  }
}

async function processPost(post) {
  const parsedPost = {
    ...post,
    platforms: safeParseJSON(post.platforms, []),
    hashtags: safeParseJSON(post.hashtags, []),
    image_url: post.imageUrl,
  };

  await prisma.post.update({
    where: { id: post.id },
    data: { status: 'publishing' },
  });

  await prisma.postLog.create({
    data: { postId: post.id, action: 'PROCESSING', message: 'Iniciando publicación automática', level: 'info' },
  });

  try {
    const result = await publishPost(parsedPost, post.account);

    if (result.success || result.partialSuccess) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          metaPostId: result.postId || null,
          errorMessage: null,
        },
      });

      await prisma.postLog.create({
        data: { postId: post.id, action: 'PUBLISHED', message: result.message, level: 'success' },
      });

      console.log(`✅ Post #${post.id} publicado: ${result.message}`);
    } else {
      await handleFailure(post, result.message);
    }
  } catch (err) {
    await handleFailure(post, err.message);
  }
}

async function handleFailure(post, errorMessage) {
  const newRetryCount = (post.retryCount || 0) + 1;
  const maxRetries = 3;

  if (newRetryCount >= maxRetries) {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage, retryCount: newRetryCount },
    });

    await prisma.postLog.create({
      data: {
        postId: post.id, action: 'FAILED',
        message: `Fallido definitivamente después de ${maxRetries} intentos: ${errorMessage}`,
        level: 'error',
      },
    });

    console.error(`❌ Post #${post.id} falló definitivamente`);
  } else {
    const retryAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'scheduled', scheduledAt: retryAt, errorMessage, retryCount: newRetryCount },
    });

    await prisma.postLog.create({
      data: {
        postId: post.id, action: 'RETRY',
        message: `Reintento ${newRetryCount}/${maxRetries}: ${errorMessage}`,
        level: 'warning',
      },
    });
  }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { initScheduler, processScheduledPosts };
