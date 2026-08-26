import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const API_BASE = import.meta.env.VITE_API_URL || ''
const ROTATE_MS = 5000

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

function Dot() {
  return <span className="fnx-announcement-bar__dot" aria-hidden="true"> · </span>
}

export default function AnnouncementBar() {
  const { shippingConfig } = useCart()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Tramos de cuotas: única fuente de verdad es backend/config/payments.js,
  // servida acá para no duplicar el número de cuotas ni el mínimo (ver el bug
  // de INSTALLMENTS=6 pelado en ProductCard.jsx, que esto reemplaza a futuro).
  const [cuotas, setCuotas] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [manualPaused, setManualPaused] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [tabHidden, setTabHidden] = useState(() => document.visibilityState === 'hidden')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/payments/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.cuotas) setCuotas(data.cuotas) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mql.matches)
    const onChange = (e) => setReducedMotion(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    function onVisibility() { setTabHidden(document.visibilityState === 'hidden') }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const threshold = shippingConfig?.freeShippingThreshold

  const tiers = useMemo(() => {
    if (!cuotas || cuotas.length === 0) return null
    const sorted = [...cuotas].sort((a, b) => a.minimo - b.minimo)
    return { base: sorted[0], best: sorted[sorted.length - 1] }
  }, [cuotas])

  function goToMediosDePago(e) {
    e.preventDefault()
    if (pathname === '/faq') setTimeout(() => scrollToId('medios-de-pago'), 60)
    else { navigate('/faq'); setTimeout(() => scrollToId('medios-de-pago'), 420) }
  }

  function goToContacto(e) {
    e.preventDefault()
    if (pathname === '/') setTimeout(() => scrollToId('contacto'), 60)
    else { navigate('/'); setTimeout(() => scrollToId('contacto'), 420) }
  }

  const slides = useMemo(() => {
    if (threshold == null || !tiers) return null
    const hasTier2 = tiers.best.cantidad !== tiers.base.cantidad
    const cuotasDesktop = (
      <>
        HASTA {tiers.base.cantidad} CUOTAS SIN INTERÉS
        {hasTier2 && <><Dot />{tiers.best.cantidad} DESDE {fmt(tiers.best.minimo)}</>}
      </>
    )
    const cuotasMobile = (
      <>
        {tiers.base.cantidad} CUOTAS SIN INTERÉS
        {hasTier2 && <><Dot />{tiers.best.cantidad} DESDE {fmt(tiers.best.minimo)}</>}
      </>
    )

    return [
      {
        key: 'envio',
        href: '/policies/shipping',
        desktop: <>ENVÍO GRATIS EN COMPRAS DESDE {fmt(threshold)}</>,
        mobile: <>ENVÍO GRATIS DESDE {fmt(threshold)}</>,
      },
      {
        key: 'cuotas',
        href: '/faq#medios-de-pago',
        onClick: goToMediosDePago,
        desktop: cuotasDesktop,
        mobile: cuotasMobile,
      },
      {
        key: 'transferencia',
        href: '/faq#medios-de-pago',
        onClick: goToMediosDePago,
        desktop: <>10% DE DESCUENTO PAGANDO CON TRANSFERENCIA</>,
        mobile: <>10% OFF POR TRANSFERENCIA</>,
      },
      {
        key: 'retiro',
        href: '/#contacto',
        onClick: goToContacto,
        desktop: <>RETIRÁ SIN CARGO EN CITY BELL</>,
        mobile: <>RETIRÁ EN CITY BELL</>,
      },
    ]
  }, [threshold, tiers, pathname])

  const playing = !manualPaused && !hovering && !tabHidden && !reducedMotion

  useEffect(() => {
    if (!playing || !slides) return undefined
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [playing, slides])

  useEffect(() => {
    if (reducedMotion) setActiveIndex(0)
  }, [reducedMotion])

  if (!slides) return null

  function prev() {
    setManualPaused(true)
    setActiveIndex((i) => (i - 1 + slides.length) % slides.length)
  }
  function next() {
    setManualPaused(true)
    setActiveIndex((i) => (i + 1) % slides.length)
  }

  return (
    <div
      className="fnx-announcement-bar"
      role="region"
      aria-label="Anuncios de la tienda"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        className="fnx-announcement-bar__control"
        onClick={() => setManualPaused((p) => !p)}
        aria-label={manualPaused ? 'Reanudar anuncios' : 'Pausar anuncios'}
      >
        {manualPaused ? '▶' : '⏸'}
      </button>

      <div className="fnx-announcement-bar__viewport">
        <button
          type="button"
          className="fnx-announcement-bar__arrow fnx-announcement-bar__arrow--prev"
          onClick={prev}
          aria-label="Anuncio anterior"
        >
          ‹
        </button>

        <div className="fnx-announcement-bar__slides" aria-live="off">
          {slides.map((slide, i) => {
            const isActive = i === activeIndex
            const content = (
              <>
                <span className="fnx-announcement-bar__text fnx-announcement-bar__text--desktop">{slide.desktop}</span>
                <span className="fnx-announcement-bar__text fnx-announcement-bar__text--mobile">{slide.mobile}</span>
              </>
            )
            return (
              <div
                key={slide.key}
                className={`fnx-announcement-bar__slide${isActive ? ' fnx-announcement-bar__slide--active' : ''}`}
                aria-hidden={!isActive}
              >
                {slide.onClick ? (
                  <a href={slide.href} onClick={slide.onClick} className="fnx-announcement-bar__link">
                    {content}
                  </a>
                ) : (
                  <Link to={slide.href} className="fnx-announcement-bar__link">
                    {content}
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          className="fnx-announcement-bar__arrow fnx-announcement-bar__arrow--next"
          onClick={next}
          aria-label="Anuncio siguiente"
        >
          ›
        </button>
      </div>
    </div>
  )
}
