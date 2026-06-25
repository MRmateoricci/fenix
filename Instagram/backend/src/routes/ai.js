const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const {
  generateImage, generateCaption,
  generateImageWithBrandProfile, generateCaptionWithBrandProfile,
  analyzePhoto,
} = require('../services/openaiService');
const { getBrandProfile } = require('../services/profileAnalysisService');

// POST /api/ai/generate — generar imagen + caption con IA
router.post('/generate', asyncHandler(async (req, res) => {
  const { prompt, niche, tone, platform, includeImage = true, includeCaption = true, accountId } = req.body;

  if (!niche && !prompt) {
    return res.status(400).json({ error: 'Se requiere un nicho o un prompt' });
  }

  // Cargar perfil de marca si se especificó una cuenta
  let brandProfile = null;
  if (accountId) {
    brandProfile = await getBrandProfile(parseInt(accountId));
  }

  const results = { used_brand_profile: !!brandProfile };

  // Generar imagen con DALL-E 3
  if (includeImage) {
    const imageResult = brandProfile
      ? await generateImageWithBrandProfile({ prompt, brandProfile })
      : await generateImage({ prompt, niche, tone });
    results.image_url = imageResult.url;
    results.image_prompt_used = imageResult.promptUsed;
    results.image_is_mock = imageResult.isMock || false;
  }

  // Generar caption y hashtags con GPT-4o
  if (includeCaption) {
    const captionResult = brandProfile
      ? await generateCaptionWithBrandProfile({ prompt, platform, brandProfile })
      : await generateCaption({ prompt, niche, tone, platform });
    results.caption = captionResult.caption;
    results.hashtags = captionResult.hashtags;
    results.caption_is_mock = captionResult.isMock || false;
  }

  res.json(results);
}));

// POST /api/ai/improve-caption — mejorar un caption existente
router.post('/improve-caption', asyncHandler(async (req, res) => {
  const { caption, niche, tone } = req.body;
  if (!caption) return res.status(400).json({ error: 'Se requiere un caption para mejorar' });

  const { improveCaption } = require('../services/openaiService');
  const result = await improveCaption({ caption, niche, tone });
  res.json(result);
}));

// POST /api/ai/analyze-photo — analizar foto subida por el usuario con GPT-4o Vision
router.post('/analyze-photo', asyncHandler(async (req, res) => {
  const { image_base64, niche, tone, platform } = req.body;
  if (!image_base64) {
    return res.status(400).json({ error: 'Se requiere una imagen en base64' });
  }
  const result = await analyzePhoto({
    imageBase64: image_base64,
    niche: niche || 'general',
    tone: tone || 'casual',
    platform: platform || 'instagram',
  });
  res.json(result);
}));

// GET /api/ai/suggestions/:niche — obtener sugerencias de contenido por nicho
router.get('/suggestions/:niche', asyncHandler(async (req, res) => {
  const { niche } = req.params;

  const suggestions = getContentSuggestions(niche);
  res.json({ niche, suggestions });
}));

// Sugerencias de contenido por nicho (datos estáticos para demo)
function getContentSuggestions(niche) {
  const map = {
    fitness: [
      'Transformación física antes/después',
      'Rutina de 5 ejercicios en 20 minutos',
      'Mitos sobre el entrenamiento que debes evitar',
      'Plan de alimentación semanal para ganar músculo',
      'Beneficios del entrenamiento matutino',
    ],
    gastronomia: [
      'Receta paso a paso de un plato estrella',
      'Ingredientes frescos de temporada',
      'Behind the scenes de la cocina',
      'Maridaje perfecto para tu plato especial',
      'Historia detrás de tu receta más popular',
    ],
    lifestyle: [
      'Mañana productiva: mi rutina completa',
      'Minimalismo y orden en el hogar',
      'Consejos para mantener el equilibrio trabajo-vida',
      'Libros que cambiaron mi perspectiva',
      'Viaje local: descubrí lo que tenés cerca',
    ],
    moda: [
      'Outfit del día con piezas clave del guardarropa',
      'Tendencias de la temporada',
      'Cómo combinar colores sin fallar',
      'Ropa sustentable: marcas que recomiendo',
      'Haul de compras con looks completos',
    ],
    tecnologia: [
      'Herramientas de IA que uso todos los días',
      'Review del gadget más esperado del año',
      'Atajos de teclado que aumentan tu productividad',
      'El futuro de X tecnología en 5 años',
      'Setup de trabajo desde casa actualizado',
    ],
    general: [
      'Reflexión motivacional con imagen de impacto',
      'Tip útil para el día a día',
      'Pregunta a tu audiencia para generar engagement',
      'Dato curioso relacionado con tu nicho',
      'Anuncio de novedad o lanzamiento',
    ],
  };

  return (map[niche.toLowerCase()] || map.general);
}

module.exports = router;
