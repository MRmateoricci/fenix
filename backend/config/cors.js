const localOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
]

const allowedOriginPatterns = [/\.ngrok-free\.dev$/, /\.ngrok-free\.app$/, /\.ngrok\.io$/]

export function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null

  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function firstForwardedValue(value) {
  return value?.split(',')[0]?.trim()
}

export function requestOrigin(req) {
  const host = firstForwardedValue(req.get('x-forwarded-host')) || req.get('host')
  const protocol = firstForwardedValue(req.get('x-forwarded-proto')) || req.protocol

  return normalizeOrigin(host && protocol ? `${protocol}://${host}` : null)
}

export function createCorsOptionsDelegate({ appBaseUrl, frontendBaseUrl } = {}) {
  const allowedOrigins = new Set(
    [...localOrigins, appBaseUrl, frontendBaseUrl]
      .map(normalizeOrigin)
      .filter(Boolean)
  )

  return (req, callback) => {
    const currentRequestOrigin = requestOrigin(req)

    callback(null, {
      credentials: true,
      origin: (origin, originCallback) => {
        // Requests without Origin are not browser CORS requests. The request's
        // public origin is also safe: it lets custom domains work behind a proxy
        // even when APP_BASE_URL still contains the provider's internal domain.
        if (!origin) return originCallback(null, true)

        const normalized = normalizeOrigin(origin)
        if (normalized && allowedOrigins.has(normalized)) return originCallback(null, true)
        if (normalized && normalized === currentRequestOrigin) return originCallback(null, true)

        if (normalized) {
          const hostname = new URL(normalized).hostname
          if (allowedOriginPatterns.some((pattern) => pattern.test(hostname))) {
            return originCallback(null, true)
          }
        }

        const error = new Error(`CORS: origen no permitido → ${origin}`)
        error.status = 403
        return originCallback(error)
      },
    })
  }
}
