import { Router } from 'express'

const router = Router()

// Electricidad E Iluminación Fénix, Cantilo 745, City Bell.
const PLACE_ID = 'ChIJrQiaoXveopURSoK4freXE38'
const PLACE_FIELDS = [
  'displayName',
  'rating',
  'userRatingCount',
  'reviews',
  'googleMapsUri',
].join(',')

router.get('/', async (_req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()

  if (!apiKey) {
    return res.status(503).json({
      error: 'Las reseñas de Google Maps todavía no están configuradas.',
    })
  }

  try {
    const params = new URLSearchParams({ languageCode: 'es', regionCode: 'AR' })
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${PLACE_ID}?${params}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACE_FIELDS,
        },
      }
    )
    const data = await response.json()

    if (!response.ok) {
      console.error('[GET /api/google-reviews] Google Places:', data.error?.message || response.status)
      return res.status(502).json({ error: 'No se pudieron cargar las reseñas de Google Maps.' })
    }

    const reviews = (data.reviews || [])
      .filter((review) => review.text?.text || review.originalText?.text)
      .map((review) => ({
        id: review.name,
        author: review.authorAttribution?.displayName || 'Cliente de Google',
        authorUrl: review.authorAttribution?.uri || data.googleMapsUri,
        authorPhoto: review.authorAttribution?.photoUri || null,
        date: review.relativePublishTimeDescription || '',
        rating: Number(review.rating) || 0,
        text: review.text?.text || review.originalText?.text || '',
        originalLanguage: review.originalText?.languageCode || null,
        translatedLanguage: review.text?.languageCode || null,
        reviewUrl: review.googleMapsUri || data.googleMapsUri,
      }))

    res.set('Cache-Control', 'no-store')
    res.json({
      placeName: data.displayName?.text || 'Electricidad E Iluminación Fénix',
      rating: Number(data.rating) || null,
      userRatingCount: Number(data.userRatingCount) || null,
      googleMapsUrl: data.googleMapsUri,
      reviews,
    })
  } catch (error) {
    console.error('[GET /api/google-reviews]', error)
    res.status(502).json({ error: 'No se pudieron cargar las reseñas de Google Maps.' })
  }
})

export default router
