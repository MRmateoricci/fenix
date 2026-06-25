// Servicio de integración con Meta Graph API
const META_API_BASE = 'https://graph.facebook.com/v19.0';

// Publicar en Instagram Business Account
async function publishToInstagram(post, account) {
  const token = account?.accessToken || process.env.META_ACCESS_TOKEN;
  const igAccountId = account?.pageId || process.env.META_INSTAGRAM_ACCOUNT_ID;

  if (!token || !igAccountId) {
    return simulatePublish('Instagram', post);
  }

  try {
    // Paso 1: Crear container de media
    const containerRes = await fetch(
      `${META_API_BASE}/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: post.image_url,
          caption: formatCaption(post.caption, post.hashtags),
          access_token: token,
        }),
      }
    );
    const container = await containerRes.json();
    if (container.error) throw new Error(container.error.message);

    // Paso 2: Publicar el container
    const publishRes = await fetch(
      `${META_API_BASE}/${igAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: token,
        }),
      }
    );
    const published = await publishRes.json();
    if (published.error) throw new Error(published.error.message);

    return { success: true, postId: published.id, message: 'Publicado exitosamente en Instagram' };
  } catch (err) {
    return { success: false, message: `Error Instagram: ${err.message}` };
  }
}

// Publicar en Página de Facebook
async function publishToFacebook(post, account) {
  const token = account?.accessToken || process.env.META_ACCESS_TOKEN;
  const pageId = account?.pageId || process.env.META_PAGE_ID;

  if (!token || !pageId) {
    return simulatePublish('Facebook', post);
  }

  try {
    const res = await fetch(
      `${META_API_BASE}/${pageId}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: post.image_url,
          message: formatCaption(post.caption, post.hashtags),
          access_token: token,
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    return { success: true, postId: data.id, message: 'Publicado exitosamente en Facebook' };
  } catch (err) {
    return { success: false, message: `Error Facebook: ${err.message}` };
  }
}

// Publicar en todas las plataformas del post usando las credenciales de la cuenta
async function publishPost(post, account = null) {
  const platforms = post.platforms || [];
  const results = [];

  // Delay aleatorio entre 1-5 segundos (comportamiento humano anti-spam)
  const delay = Math.floor(Math.random() * 4000) + 1000;
  await sleep(delay);

  for (const platform of platforms) {
    let result;
    if (platform === 'instagram') {
      result = await publishToInstagram(post, account);
    } else if (platform === 'facebook') {
      result = await publishToFacebook(post, account);
    } else {
      result = { success: false, message: `Plataforma desconocida: ${platform}` };
    }
    results.push({ platform, ...result });
  }

  const allSuccess = results.every(r => r.success);
  const anySuccess = results.some(r => r.success);

  return {
    success: allSuccess,
    partialSuccess: anySuccess && !allSuccess,
    results,
    postId: results.find(r => r.postId)?.postId || null,
    message: results.map(r => `${r.platform}: ${r.message}`).join(' | '),
  };
}

// Verificar token llamando a la Graph API real
async function verifyToken(accessToken) {
  try {
    const res = await fetch(`${META_API_BASE}/me?access_token=${accessToken}&fields=id,name`);
    const data = await res.json();
    if (data.error) return { valid: false, message: data.error.message };
    return { valid: true, message: `Token válido — ${data.name} (ID: ${data.id})` };
  } catch (err) {
    return { valid: false, message: `No se pudo verificar: ${err.message}` };
  }
}

// Simular publicación cuando no hay credenciales reales
function simulatePublish(platform, post) {
  console.log(`📤 [SIMULADO] Publicando en ${platform}: "${(post.caption || '').substring(0, 50)}..."`);
  const success = Math.random() > 0.1;
  const mockPostId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    success,
    postId: success ? mockPostId : null,
    message: success
      ? `Publicado exitosamente en ${platform} (simulado — sin credenciales reales)`
      : `Error simulado en ${platform}: token expirado`,
    simulated: true,
  };
}

function formatCaption(caption, hashtags) {
  if (!hashtags || hashtags.length === 0) return caption || '';
  const tags = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
  return `${caption || ''}\n\n${tags}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { publishPost, publishToInstagram, publishToFacebook, verifyToken };
