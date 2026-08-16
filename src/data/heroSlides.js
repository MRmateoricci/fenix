import herramientasImg from '../assets/carru2.png'
import promocionesImg from '../assets/carru3.png'
import nuevosIngresosImg from '../assets/carru1.png'

// Hero carousel slides. Each slide accepts an `imageUrl` (path to the real photo).
// Until real photos are ready, leave `imageUrl` as null and use `imagePlaceholder`
// as the on-screen label — the carousel renders a solid-color block with that text
// instead of a background photo. Swap in real photos by setting `imageUrl` (the
// placeholder is then ignored automatically).
//
// Slides whose photo already has its own title/CTA baked into the design should
// set `textOverlay: false` so Home.jsx doesn't draw a second title/subtitle/button
// on top of it — the whole slide becomes a clickable banner to `ctaHref` instead.
//
// For the mobile banner, import the portrait asset and assign it to
// `mobileImageUrl`. `mobileAspectRatio` defaults to 4 / 5 and can be adjusted to
// match the exported artwork. While it is null, mobile keeps using the desktop
// banner and its original wide aspect ratio.
export const HERO_SLIDES = [
  {
    title: 'Nuestras herramientas más vendidas',
    subtitle: 'Herramientas destacadas',
    ctaText: 'Ver herramientas',
    ctaHref: '/products?category=Herramientas',
    imageUrl: herramientasImg,
    mobileImageUrl: null,
    mobileAspectRatio: '4 / 5',
    textOverlay: false,
  },
  {
    title: 'Aprovechá nuestras ofertas en iluminación',
    subtitle: 'Promociones especiales',
    ctaText: 'Ver promociones',
    ctaHref: '/products?category=Promociones',
    imageUrl: promocionesImg,
    mobileImageUrl: null,
    mobileAspectRatio: '4 / 5',
    textOverlay: false,
  },
  {
    title: 'Descubrí nuestro catálogo',
    subtitle: 'Nuevos ingresos',
    ctaText: 'Ver productos',
    ctaHref: '/products',
    imageUrl: nuevosIngresosImg,
    mobileImageUrl: null,
    mobileAspectRatio: '4 / 5',
    textOverlay: false,
  },
]
