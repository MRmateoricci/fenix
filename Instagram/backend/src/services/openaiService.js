const OpenAI = require('openai');

// Inicializar cliente OpenAI solo si hay API key
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Imágenes mock para demo cuando no hay API key
const MOCK_IMAGES = [
  'https://picsum.photos/seed/mock1/800/800',
  'https://picsum.photos/seed/mock2/800/800',
  'https://picsum.photos/seed/mock3/800/800',
  'https://picsum.photos/seed/mock4/800/800',
  'https://picsum.photos/seed/mock5/800/800',
];

// Captions mock por nicho
const MOCK_CAPTIONS = {
  fitness: {
    caption: '💪 La disciplina te lleva a donde la motivación no siempre puede. Hoy es el día para superar tus límites y demostrar de qué estás hecho. ¡El éxito está en la constancia!\n\n¿Ya entrenaste hoy? Contanos en los comentarios 👇',
    hashtags: ['fitness', 'gym', 'entrenamiento', 'motivacion', 'saludable', 'workout', 'musculos', 'fuerza', 'cardio', 'bienestar', 'fitnessmotivation', 'gymlife', 'salud', 'ejercicio', 'transformacion'],
  },
  gastronomia: {
    caption: '🍽️ Cada plato cuenta una historia. Este es el resultado de horas de dedicación, ingredientes frescos y mucho amor por la cocina. ¿Se animan a probarlo?\n\n📍 Reservas abiertas para esta semana. Link en bio.',
    hashtags: ['gastronomia', 'foodie', 'receta', 'cocina', 'argentina', 'food', 'chef', 'delicioso', 'yummy', 'instafood', 'foodphotography', 'gastronomiargentina', 'buenosaires', 'restaurant'],
  },
  lifestyle: {
    caption: '✨ El estilo de vida que elegís hoy define la persona que serás mañana. Pequeños cambios, grandes resultados.\n\nEl secreto está en construir hábitos que te acerquen a tu mejor versión cada día 🌱',
    hashtags: ['lifestyle', 'motivacion', 'habitos', 'crecimientopersonal', 'bienestar', 'mindset', 'exito', 'positivity', 'vida', 'inspiracion', 'argentina', 'selfimprovement', 'dailyinspiration'],
  },
  moda: {
    caption: '👗 El estilo no es lo que usás, es cómo lo usás. Este look minimalista demuestra que menos es siempre más.\n\nInspírate y creá tu propio estilo ✨',
    hashtags: ['moda', 'fashion', 'style', 'outfit', 'ootd', 'look', 'tendencias', 'ropa', 'modaargentina', 'fashionista', 'streetstyle', 'minimal'],
  },
  tecnologia: {
    caption: '🚀 La tecnología no para de evolucionar y nosotros tampoco. Esto cambió completamente mi workflow diario.\n\n¿Ya lo probaste? Contame tu experiencia en los comentarios 👇',
    hashtags: ['tecnologia', 'tech', 'startup', 'ia', 'artificialintelligence', 'digital', 'innovacion', 'gadgets', 'productividad', 'software', 'developer', 'argentina'],
  },
  general: {
    caption: '🌟 Cada día es una nueva oportunidad para ser mejor que ayer. No se trata de competir con los demás, sino de superarte a vos mismo.\n\n¿Cuál es tu meta de esta semana? 👇',
    hashtags: ['motivacion', 'inspiracion', 'crecimiento', 'metas', 'positivo', 'argentina', 'exito', 'mentalidad', 'actitudpositiva', 'diario', 'reflexion'],
  },
};

// Generar imagen con DALL-E 3 (o mock si no hay API key)
async function generateImage({ prompt, niche, tone }) {
  if (!openai) {
    console.log('⚠️  Sin OPENAI_API_KEY — usando imagen de demo');
    const randomImage = MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
    return { url: randomImage, promptUsed: prompt || niche, isMock: true };
  }

  const builtPrompt = buildImagePrompt({ prompt, niche, tone });

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: builtPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });

    return {
      url: response.data[0].url,
      promptUsed: builtPrompt,
      isMock: false,
    };
  } catch (err) {
    console.error('Error generando imagen:', err.message);
    return {
      url: MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)],
      promptUsed: builtPrompt,
      isMock: true,
      error: err.message,
    };
  }
}

// Generar caption y hashtags con GPT-4o
async function generateCaption({ prompt, niche, tone, platform }) {
  const nicheKey = (niche || 'general').toLowerCase();

  if (!openai) {
    console.log('⚠️  Sin OPENAI_API_KEY — usando caption de demo');
    const mock = MOCK_CAPTIONS[nicheKey] || MOCK_CAPTIONS.general;
    return { ...mock, isMock: true };
  }

  const systemPrompt = buildCaptionSystemPrompt(tone, platform);
  const userPrompt = buildCaptionUserPrompt({ niche, prompt, tone });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const text = response.choices[0].message.content;
    return parseGPTResponse(text);
  } catch (err) {
    console.error('Error generando caption:', err.message);
    const mock = MOCK_CAPTIONS[nicheKey] || MOCK_CAPTIONS.general;
    return { ...mock, isMock: true, error: err.message };
  }
}

// Mejorar caption existente
async function improveCaption({ caption, niche, tone }) {
  if (!openai) {
    return { caption: caption + '\n\n✨ (Versión mejorada - conectá OpenAI API para mejoras reales)', isMock: true };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Sos un experto en marketing digital para redes sociales. Mejorá el caption dado manteniendo el tono solicitado.' },
      { role: 'user', content: `Mejorá este caption para Instagram con tono ${tone || 'casual'}, nicho ${niche || 'general'}:\n\n"${caption}"\n\nDevolvé solo el caption mejorado.` },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  return { caption: response.choices[0].message.content, isMock: false };
}

// Construir prompt para DALL-E 3
function buildImagePrompt({ prompt, niche, tone }) {
  const niches = {
    fitness: 'fitness lifestyle, gym, healthy body, athletic',
    gastronomia: 'professional food photography, restaurant, gourmet plating',
    lifestyle: 'modern lifestyle, aesthetic, minimal, clean',
    moda: 'fashion photography, stylish outfit, editorial look',
    tecnologia: 'tech product photography, modern gadgets, digital',
    general: 'modern, clean, professional',
  };

  const tones = {
    inspiracional: 'motivational, uplifting, bright colors',
    formal: 'professional, corporate, clean composition',
    casual: 'friendly, warm, approachable',
    humoristico: 'fun, colorful, playful',
  };

  const nicheStyle = niches[(niche || '').toLowerCase()] || niches.general;
  const toneStyle = tones[(tone || '').toLowerCase()] || tones.casual;

  if (prompt) {
    return `${prompt}. Style: ${nicheStyle}, ${toneStyle}. Square format, Instagram-optimized, high quality, professional photography.`;
  }

  return `A beautiful ${nicheStyle} photograph. ${toneStyle}. Square format, Instagram-optimized, high quality.`;
}

// System prompt para generación de captions
function buildCaptionSystemPrompt(tone, platform) {
  const tones = {
    inspiracional: 'inspirador, motivacional y emotivo',
    formal: 'profesional, serio y corporativo',
    casual: 'cercano, amigable y conversacional',
    humoristico: 'divertido, con humor y entretenido',
  };

  const toneDesc = tones[(tone || '').toLowerCase()] || tones.casual;
  const platformNote = platform === 'facebook' ? 'para Facebook (permite más texto)' : 'para Instagram (conciso y visual)';

  return `Sos un experto en marketing digital y redes sociales especializado en el mercado latinoamericano (Argentina).
Generás contenido en español rioplatense con tono ${toneDesc} ${platformNote}.
Respondé SIEMPRE en formato JSON con este esquema exacto:
{
  "caption": "el texto del post sin hashtags",
  "hashtags": ["hashtag1", "hashtag2", ...] // máximo 15 hashtags relevantes, sin el #
}`;
}

function buildCaptionUserPrompt({ niche, prompt, tone }) {
  if (prompt) {
    return `Generá un caption para redes sociales sobre: "${prompt}". Nicho: ${niche || 'general'}.`;
  }
  return `Generá un caption para redes sociales para el nicho de ${niche}. Tono: ${tone || 'casual'}.`;
}

// Parsear respuesta de GPT
function parseGPTResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        caption: parsed.caption || text,
        hashtags: parsed.hashtags || [],
        isMock: false,
      };
    }
  } catch {}

  return { caption: text, hashtags: [], isMock: false };
}

// Generar imagen con DALL-E 3 usando el estilo visual del perfil de marca
async function generateImageWithBrandProfile({ prompt, brandProfile }) {
  const vs = brandProfile.visual_style || {};
  const styleDesc = [
    vs.aesthetic,
    vs.mood ? `mood ${vs.mood}` : null,
    vs.colors?.length ? `paleta: ${vs.colors.slice(0, 3).join(', ')}` : null,
    vs.lighting ? `iluminación ${vs.lighting}` : null,
    vs.composition ? `composición ${vs.composition}` : null,
  ].filter(Boolean).join(', ');

  const builtPrompt = prompt
    ? `${prompt}. Estilo visual de la marca: ${styleDesc}. Formato cuadrado, optimizado para Instagram, alta calidad, fotografía profesional.`
    : `Fotografía profesional para Instagram con estilo ${styleDesc}. Formato cuadrado, alta calidad.`;

  if (!openai) {
    const randomImage = MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
    return { url: randomImage, promptUsed: builtPrompt, isMock: true };
  }

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: builtPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });
    return { url: response.data[0].url, promptUsed: builtPrompt, isMock: false };
  } catch (err) {
    console.error('Error generando imagen con brand profile:', err.message);
    return {
      url: MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)],
      promptUsed: builtPrompt,
      isMock: true,
      error: err.message,
    };
  }
}

// Generar caption con GPT-4o usando la voz y tono del perfil de marca
async function generateCaptionWithBrandProfile({ prompt, platform, brandProfile }) {
  const tv = brandProfile.tone_voice || {};
  const themes = brandProfile.content_themes || [];
  const hashtags = brandProfile.typical_hashtags || [];
  const samples = brandProfile.sample_captions || [];

  if (!openai) {
    const mockCaption = samples[0] || '✨ Nuevo contenido exclusivo para vos.\n\n¿Qué te parece? Contanos en los comentarios 👇';
    const mockHashtags = hashtags.length > 0 ? hashtags : MOCK_CAPTIONS.general.hashtags;
    return { caption: mockCaption, hashtags: mockHashtags, isMock: true };
  }

  const sampleText = samples.length > 0
    ? `\n\nEjemplos reales de sus publicaciones anteriores:\n${samples.map((s, i) => `${i + 1}. "${s.substring(0, 150)}"`).join('\n')}`
    : '';

  const systemPrompt = `Sos un experto en marketing digital que escribe captions en el estilo exacto de esta cuenta de Instagram.

Perfil de comunicación de la cuenta:
- Formalidad: ${tv.formality || 'casual'}
- Emojis: ${tv.uses_emojis ? `sí, frecuencia ${tv.emoji_frequency}` : 'no usa emojis'}
- Humor: ${tv.humor_level || 'sutil'}
- Tipo de CTA: ${tv.cta_style || 'pregunta abierta'}
- Idioma/dialecto: ${tv.language_style || 'rioplatense'}
- Longitud típica: ${tv.avg_length || 'medium'}
- Temas frecuentes: ${themes.join(', ') || 'general'}${sampleText}

IMPORTANTE: Replicá fielmente el estilo y tono de sus posts anteriores.
Respondé SIEMPRE en formato JSON con este esquema exacto:
{
  "caption": "el texto del post sin hashtags",
  "hashtags": ["hashtag1", "hashtag2", ...] // máximo 15 hashtags relevantes, sin el #
}`;

  const userPrompt = prompt
    ? `Generá un caption sobre: "${prompt}" para ${platform || 'Instagram'}.`
    : `Generá un caption típico de esta cuenta para ${platform || 'Instagram'}.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const text = response.choices[0].message.content;
    const result = parseGPTResponse(text);

    // Mezcla los hashtags generados con los típicos de la marca
    const brandHashtags = hashtags.slice(0, 5);
    const allHashtags = [...new Set([...result.hashtags, ...brandHashtags])].slice(0, 15);

    return { ...result, hashtags: allHashtags, isMock: false };
  } catch (err) {
    console.error('Error generando caption con brand profile:', err.message);
    return {
      caption: samples[0] || `✨ ${prompt || 'Nuevo contenido'}`,
      hashtags: hashtags.length > 0 ? hashtags : MOCK_CAPTIONS.general.hashtags,
      isMock: true,
      error: err.message,
    };
  }
}

// Analizar foto subida por el usuario con GPT-4o Vision
async function analyzePhoto({ imageBase64, niche, tone, platform }) {
  const nicheCtx = niche || 'general';
  const platformCtx = platform || 'instagram';
  const toneCtx = tone || 'casual';

  const mockResult = {
    analysis: {
      score: 6,
      product_detected: 'Producto (demo — configurá OPENAI_API_KEY para análisis real)',
      strengths: [
        'El producto es el elemento principal de la foto',
        'La composición central permite identificar el artículo fácilmente',
      ],
      improvements: [
        'El fondo podría ser más limpio y neutro para que el producto resalte',
        'Mejorar la iluminación eliminaría sombras no deseadas',
        'Un ángulo distinto podría mostrar más detalles del producto',
      ],
      tips: {
        lighting: 'Usá luz natural suave cerca de una ventana grande. Evitá el flash directo que genera brillos y sombras duras. La hora dorada (amanecer/atardecer) da una luz cálida ideal.',
        angle: 'Para ropa y accesorios, probá el flat lay (desde arriba) o a 45°. Si es ropa, queda bien sobre una persona o maniquí. Variá ángulos y elegí el que muestre más valor.',
        background: 'Un fondo blanco, beige o de madera clara hace que el producto resalte. Evitá fondos con patrones fuertes o colores que compitan con el producto.',
        styling: 'Limpiá bien el área alrededor del producto. Añadí props o accesorios que complementen el estilo (flores, plantas, texturas). Menos es más.',
        editing: 'Un ligero aumento de brillo (+10) y contraste (+15) mejora la percepción visual. Usá filtros o presets coherentes para mantener una estética de feed consistente.',
      },
    },
    suggested_caption: `✨ Nuevo en nuestra colección, diseñado para vos.\n\n¿Te gustó? Escribinos por DM para más info 📩\n\n¡Disponible ahora!`,
    suggested_hashtags: [nicheCtx, 'producto', 'nuevo', 'disponible', 'tendencia', 'style', 'compras', 'novedades'],
    enhanced_image_prompt: 'Professional product photography on clean white background, soft natural window lighting, minimalist composition, high-end commercial photo',
    is_mock: true,
  };

  if (!openai) {
    console.log('⚠️  Sin OPENAI_API_KEY — usando análisis de foto de demo');
    return mockResult;
  }

  const systemPrompt = `Sos un fotógrafo profesional y experto en marketing visual para ${platformCtx}.
Analizás fotos de productos y dás recomendaciones concretas y accionables en español rioplatense.
El nicho del usuario es: ${nicheCtx}. El tono deseado: ${toneCtx}.
Respondé SIEMPRE en formato JSON con este esquema exacto:
{
  "analysis": {
    "score": <número del 1 al 10>,
    "product_detected": "<qué producto/objeto se ve en la foto>",
    "strengths": ["fortaleza 1", "fortaleza 2"],
    "improvements": ["mejora 1", "mejora 2", "mejora 3"],
    "tips": {
      "lighting": "<consejo específico de iluminación>",
      "angle": "<consejo específico de ángulo y perspectiva>",
      "background": "<consejo de fondo y escenografía>",
      "styling": "<consejo de presentación y estilismo>",
      "editing": "<consejo de edición post-producción>"
    }
  },
  "suggested_caption": "<caption listo para ${platformCtx}, tono ${toneCtx}, nicho ${nicheCtx}, con emojis>",
  "suggested_hashtags": ["hashtag1", "hashtag2"],
  "enhanced_image_prompt": "<prompt en inglés para DALL-E 3 que genere una versión mejorada/profesional de esta foto>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
            { type: 'text', text: systemPrompt },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[0]), is_mock: false };
    }
    throw new Error('Respuesta inesperada de la IA');
  } catch (err) {
    console.error('Error analizando foto:', err.message);
    return { ...mockResult, is_mock: true, error: err.message };
  }
}

module.exports = { generateImage, generateCaption, improveCaption, generateImageWithBrandProfile, generateCaptionWithBrandProfile, analyzePhoto };
