import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

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
  const [manualPaused, setManualPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/payments/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.cuotas) setCuotas(data.cuotas) })
      .catch(() => {})
    return () => { cancelled = true }
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

  if (!slides) return null

  function renderSlides(duplicate = false) {
    return slides.map((slide) => {
      const content = (
        <>
          <span className="fnx-announcement-bar__text fnx-announcement-bar__text--desktop">{slide.desktop}</span>
          <span className="fnx-announcement-bar__text fnx-announcement-bar__text--mobile">{slide.mobile}</span>
        </>
      )

      return (
        <div key={`${slide.key}-${duplicate ? 'copy' : 'original'}`} className="fnx-announcement-bar__slide">
          {slide.onClick ? (
            <a
              href={slide.href}
              onClick={slide.onClick}
              className="fnx-announcement-bar__link"
              tabIndex={duplicate ? -1 : undefined}
            >
              {content}
            </a>
          ) : (
            <Link
              to={slide.href}
              className="fnx-announcement-bar__link"
              tabIndex={duplicate ? -1 : undefined}
            >
              {content}
            </Link>
          )}
        </div>
      )
    })
  }

  return (
    <div
      className="fnx-announcement-bar"
      role="region"
      aria-label="Anuncios de la tienda"
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
        <div
          className={`fnx-announcement-bar__track${manualPaused ? ' fnx-announcement-bar__track--paused' : ''}`}
          aria-live="off"
        >
          <div className="fnx-announcement-bar__slides">{renderSlides()}</div>
          <div className="fnx-announcement-bar__slides" aria-hidden="true">{renderSlides(true)}</div>
        </div>
      </div>
    </div>
  )
}
