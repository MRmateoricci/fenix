const { prisma } = require('../database');

let openai = null;
if (process.env.OPENAI_API_KEY) {
  const OpenAI = require('openai');
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const META_API_BASE = 'https://graph.facebook.com/v19.0';

// Intenta traer los posts reales de la cuenta via Meta Graph API
async function fetchRealPosts(account) {
  if (!account.accessToken || !account.pageId) return null;

  try {
    const res = await fetch(
      `${META_API_BASE}/${account.pageId}/media?fields=id,caption,media_url,timestamp,like_count,comments_count&limit=9&access_token=${account.accessToken}`
    );
    const data = await res.json();
    if (data.error || !data.data?.length) return null;

    return data.data.map(post => ({
      id: post.id,
      imageUrl: post.media_url,
      caption: post.caption || '',
      likes: post.like_count || 0,
      comments: post.comments_count || 0,
      timestamp: post.timestamp,
    }));
  } catch {
    return null;
  }
}

// Genera posts de demo cuando no hay credenciales reales
function generateMockPosts(account) {
  const seed = account.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'brand';

  const captions = [
    '✨ Cada día es una nueva oportunidad para crecer. ¿Con qué meta arrancás hoy?\n\n#motivacion #crecimiento #argentina',
    'Detrás de cada logro, hay días de trabajo silencioso. 💪\n\n#emprendedor #constancia #proceso',
    'Lo que no se ve: las horas antes del resultado. 🌙\n\nContame en los comentarios tu proceso 👇\n\n#detras_de_camara #autenticidad',
    'Pequeños pasos, grandes cambios. La constancia es el secreto. ✨\n\n#mindset #habitos #crecimientopersonal',
    'El mejor momento para empezar fue ayer. El segundo mejor momento es ahora. 🚀\n\n#emprendimiento #accion #presente',
    '¿Cuántas veces te rendiste antes de lograrlo? Yo muchas. Y por eso sé que vale la pena. 🙌\n\n#resiliencia #exito #camino',
    'Esto que ves tomó meses de trabajo. Pero acá estamos. 🙏\n\n¿Qué estás construyendo vos? 👇\n\n#logros #comunidad',
    'La diferencia entre quien lo logra y quien no: consistencia. Nada más. ⚡\n\n#disciplina #mentalidad #resultados',
    'Hoy quiero recordarte que el progreso no siempre es lineal. Y está bien. 🌱\n\n#proceso #paciencia #crecimiento',
  ];

  return captions.map((caption, i) => ({
    id: `mock_${i + 1}`,
    imageUrl: `https://picsum.photos/seed/${seed}${i + 1}/800/800`,
    caption,
    likes: Math.floor(Math.random() * 600) + 80,
    comments: Math.floor(Math.random() * 60) + 8,
    timestamp: new Date(Date.now() - i * 4 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

// Analiza el estilo visual usando GPT-4o Vision
async function analyzeVisualStyle(imageUrls) {
  if (!openai || !imageUrls.length) return getDefaultVisualStyle();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analizá el estilo visual de esta cuenta de Instagram mirando estas imágenes de sus publicaciones recientes.
Respondé SOLO en formato JSON con este esquema exacto (sin texto adicional):
{
  "colors": ["color1 en español", "color2 en español", "color3 en español"],
  "mood": "descripción del mood general en 3-5 palabras",
  "aesthetic": "estilo estético principal (ej: minimalista, vibrante, editorial, raw, lifestyle)",
  "composition": "estilo de composición típico (ej: centrada, regla de tercios, flat lay, retrato)",
  "lighting": "tipo de iluminación predominante (ej: natural suave, artificial cálida, dramática, studio)"
}`,
            },
            ...imageUrls.slice(0, 6).map(url => ({
              type: 'image_url',
              image_url: { url, detail: 'low' },
            })),
          ],
        },
      ],
      max_tokens: 300,
    });

    const text = response.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (err) {
    console.error('Error en análisis visual:', err.message);
  }

  return getDefaultVisualStyle();
}

// Analiza el tono y voz de las captions usando GPT-4o
async function analyzeCaptionStyle(captions) {
  if (!openai || !captions.length) return getDefaultToneVoice();

  const captionsText = captions
    .slice(0, 6)
    .map((c, i) => `Caption ${i + 1}: "${c.substring(0, 200)}"`)
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Sos un experto en análisis de comunicación digital para redes sociales latinoamericanas.',
        },
        {
          role: 'user',
          content: `Analizá el estilo de comunicación de esta cuenta de Instagram basándote en estas captions:

${captionsText}

Respondé SOLO en formato JSON con este esquema exacto (sin texto adicional):
{
  "formality": "muy casual | casual | semi-formal | formal",
  "uses_emojis": true,
  "emoji_frequency": "none | occasional | frequent",
  "humor_level": "none | subtle | moderate",
  "cta_style": "open question | direct cta | none | mix",
  "language_style": "rioplatense | neutro latinoamericano | formal",
  "avg_length": "short | medium | long",
  "content_themes": ["tema1", "tema2", "tema3", "tema4"],
  "typical_hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6"]
}`,
        },
      ],
      max_tokens: 400,
    });

    const text = response.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (err) {
    console.error('Error en análisis de captions:', err.message);
  }

  return getDefaultToneVoice();
}

function getDefaultVisualStyle() {
  return {
    colors: ['blanco cálido', 'gris oscuro', 'beige arena'],
    mood: 'auténtico y cercano',
    aesthetic: 'lifestyle minimalista',
    composition: 'centrada con espacio negativo',
    lighting: 'natural suave',
  };
}

function getDefaultToneVoice() {
  return {
    formality: 'casual',
    uses_emojis: true,
    emoji_frequency: 'occasional',
    humor_level: 'subtle',
    cta_style: 'open question',
    language_style: 'rioplatense',
    avg_length: 'medium',
    content_themes: ['motivación', 'lifestyle', 'crecimiento personal', 'emprendimiento'],
    typical_hashtags: ['motivacion', 'argentina', 'emprendedor', 'lifestyle', 'crecimiento'],
  };
}

// Función principal: construye y guarda el perfil de marca
async function buildBrandProfile(accountId) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Cuenta no encontrada');

  // Intentar posts reales, caer en mock si no hay credenciales
  const realPosts = await fetchRealPosts(account);
  const isMock = !realPosts;
  const posts = realPosts ?? generateMockPosts(account);

  const imageUrls = posts.map(p => p.imageUrl).filter(Boolean);
  const captions = posts.map(p => p.caption).filter(Boolean);

  // Analizar en paralelo con GPT-4 Vision + GPT-4o
  const [visualStyle, toneData] = await Promise.all([
    analyzeVisualStyle(imageUrls),
    analyzeCaptionStyle(captions),
  ]);

  const { content_themes = [], typical_hashtags = [], ...toneVoice } = toneData;

  const profileData = {
    visualStyle: JSON.stringify(visualStyle),
    contentThemes: JSON.stringify(content_themes),
    toneVoice: JSON.stringify(toneVoice),
    typicalHashtags: JSON.stringify(typical_hashtags),
    sampleCaptions: JSON.stringify(captions.slice(0, 3)),
    referenceImages: JSON.stringify(imageUrls.slice(0, 6)),
    postsAnalyzed: posts.length,
    analyzedAt: new Date(),
  };

  const profile = await prisma.brandProfile.upsert({
    where: { accountId },
    update: profileData,
    create: { accountId, ...profileData },
  });

  return serializeProfile(profile, isMock);
}

// Devuelve el perfil guardado o null si no existe
async function getBrandProfile(accountId) {
  const profile = await prisma.brandProfile.findUnique({ where: { accountId } });
  if (!profile) return null;
  return serializeProfile(profile, false);
}

// Parsea los campos JSON del perfil desde la BD
function serializeProfile(profile, isMock) {
  return {
    ...profile,
    account_id: profile.accountId,
    visual_style: JSON.parse(profile.visualStyle),
    content_themes: JSON.parse(profile.contentThemes),
    tone_voice: JSON.parse(profile.toneVoice),
    typical_hashtags: JSON.parse(profile.typicalHashtags),
    sample_captions: JSON.parse(profile.sampleCaptions),
    reference_images: JSON.parse(profile.referenceImages),
    posts_analyzed: profile.postsAnalyzed,
    analyzed_at: profile.analyzedAt,
    is_mock: isMock,
  };
}

module.exports = { buildBrandProfile, getBrandProfile };
