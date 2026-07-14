// Full catalog taxonomy for the header "Categoría" mega-menu.
// Only the top-level `label` values map to real product categories/filters
// (see CATEGORY_NAV_LABEL / CATEGORY_SUBCATEGORIES in ./products.js) — the
// nested levels below are for browsing/navigation across the whole catalog.
// Nodes only declare `to` where the catalog can actually filter that deep
// (category, category + subcategory, or the cable-type filter); every other
// node inherits its closest ancestor's `to` below, so every label in the
// menu ends up selectable even past the point the catalog can filter.

function leaf(label) {
  return { label }
}

const RAW_CATEGORY_TREE = [
  {
    label: 'Electricidad',
    to: '/products?category=Electricidad',
    children: [
      {
        label: 'Cables Normalizados',
        to: '/products?category=Electricidad&sub=Cables Normalizados',
        children: ['Unipolares', 'Paralelo', 'Tipo Taller', 'Subterráneo'].map((cableType) => ({
          label: cableType,
          to: `/products?category=Electricidad&sub=Cables Normalizados&ctype=${cableType}`,
        })),
      },
      {
        label: 'Disyuntores',
        to: '/products?category=Electricidad&sub=Disyuntores',
        children: ['Unipolares', 'Bipolares', 'Tripolares', 'Tetrapolares'].map(leaf),
      },
      {
        label: 'Interruptores Caja Moldeada',
        to: '/products?category=Electricidad&sub=Interruptores Caja Moldeada',
        children: [
          { label: 'Térmicas', children: ['Unipolares', 'Bipolares', 'Tripolares', 'Tetrapolares'].map(leaf) },
          { label: 'Accesorios Eléctricos', children: ['Otros', 'Núcleos', 'Límites de Carrera', 'Interruptores y Control', 'Protectores de Sobretensión', 'Relés Térmicos'].map(leaf) },
        ],
      },
      {
        label: 'Conectores Industriales',
        to: '/products?category=Electricidad&sub=Conectores Industriales',
        children: ['Fichas Macho', 'Fichas Hembra', 'Bases Empotrables', 'Bases Murales', 'Bases Mural Macho', 'Bases con Bloqueo', 'Adaptadores / Tomas'].map(leaf),
      },
      {
        label: 'Motores',
        to: '/products?category=Electricidad&sub=Motores',
        children: ['Monofásico', 'Trifásico'].map(leaf),
      },
      {
        label: 'Cajas y Cuadros de Distribución',
        to: '/products?category=Electricidad&sub=Cajas y Cuadros de Distribución',
        children: ['Cuadros Ciegos', 'Cajas Vacías', 'Cajas para Térmicas', 'Cuadros con Módulos y Bases', 'Cajas de Derivación', 'Cajas Múltiples', 'Cajas Redondas', 'Cajas de Paso', 'Gabinetes Estanco'].map(leaf),
      },
      {
        label: 'Interruptores y Maniobras',
        to: '/products?category=Electricidad&sub=Interruptores y Maniobras',
        children: ['Interruptores de Maniobra'].map(leaf),
      },
      {
        label: 'Accesorios para Instalación',
        to: '/products?category=Electricidad&sub=Accesorios para Instalación',
        children: ['Kits de Unión', 'Revisar', 'Fijaciones / Bastidores', 'Suspensiones Articuladas'].map(leaf),
      },
      {
        label: 'Caños y Curvas',
        to: '/products?category=Electricidad&sub=Caños y Curvas',
        children: ['Caños Rigidos', 'Curvas', 'Caños Corrugados', 'Grampas, Conectores y Uniones'].map(leaf),
      },
      {
        label: 'Módulos, Llaves y Tomas',
        to: '/products?category=Electricidad&sub=Módulos, Llaves y Tomas',
        children: [
          { label: 'MACROLED', children: ['Bastidores', 'MILAN', 'ROMA', 'TOKIO', 'KALOP'].map(leaf) },
          { label: 'Civil', children: ['Zen', 'Jonica', 'Luminic', 'Módulos', 'Cajas Capsuladas'].map(leaf) },
          { label: 'CAMBRE', children: ['Tapas', 'Módulos', 'Ribetes & Bastidores'].map(leaf) },
          { label: 'TECLASTAR', children: ['Marcos', 'Módulos', 'Interruptor', 'Tomacorriente'].map(leaf) },
          { label: 'JELUZ', children: ['Módulos', 'Tapas', 'Bases y Bastidores', 'Accesorios'].map(leaf) },
        ],
      },
      {
        label: 'Seguridad',
        to: '/products?category=Electricidad&sub=Seguridad',
        children: ['Cámaras de seguridad', 'Accesorios'].map(leaf),
      },
      {
        label: 'Electrohogar',
        to: '/products?category=Electricidad&sub=Electrohogar',
        children: ['Boyas'].map(leaf),
      },
    ],
  },
  {
    label: 'Herramientas',
    to: '/products?category=Herramientas',
    children: [
      {
        label: 'Herramientas Eléctricas',
        to: '/products?category=Herramientas&sub=Herramientas Eléctricas',
        children: ['Pistolas Eléctricas', 'Martillos', 'Amoladoras', 'Sierras', 'Minitorno', 'Fresadoras y Mezcladores', 'Lijadoras y Pulidoras', 'Taladros y Rotopercutores'].map(leaf),
      },
      {
        label: 'Kits y Sets',
        to: '/products?category=Herramientas&sub=Kits y Sets',
        children: ['Sets de Herramientas Neumáticas', 'Kits Eléctricos o Inalámbricos', 'Otros Sets', 'Set de Mini Torno', 'Sets de Pinzas y Alicates', 'Kits de Sierras', 'Sets de Destornilladores'].map(leaf),
      },
      {
        label: 'Herramientas Manuales',
        to: '/products?category=Herramientas&sub=Herramientas Manuales',
        children: ['Alicates y Pinzas', 'Escuadras Magnéticas', 'Tenazas y Cortapernos', 'Llaves', 'Tijeras y Cortatubos', 'Cutter y Serruchos', 'Herramientas de Vidrio', 'Destornilladores'].map(leaf),
      },
      {
        label: 'Energía y Potencia',
        to: '/products?category=Herramientas&sub=Energía y Potencia',
        children: ['Grupos Electrógenos', 'Bombas de Agua', 'Baterías y Cargadores'].map(leaf),
      },
      {
        label: 'Herramientas Inalámbricas',
        to: '/products?category=Herramientas&sub=Herramientas Inalámbricas',
        children: ['Cortacésped Inalámbrico', 'Cortacercos Inalámbrico', 'Ventilador Inalámbrico', 'Taladros Inalámbricos'].map(leaf),
      },
      { label: 'Soldadura', to: '/products?category=Herramientas&sub=Soldadura' },
      { label: 'Hidrolavadoras', to: '/products?category=Herramientas&sub=Hidrolavadoras' },
      { label: 'Neumáticas y Compresores', to: '/products?category=Herramientas&sub=Neumáticas y Compresores' },
      { label: 'Accesorios y Consumibles', to: '/products?category=Herramientas&sub=Accesorios y Consumibles' },
      { label: 'Otros', to: '/products?category=Herramientas&sub=Otros' },
    ],
  },
  {
    label: 'Iluminación',
    to: '/products?category=Iluminación',
    children: [
      {
        label: 'Automatización Inteligente',
        to: '/products?category=Iluminación&sub=Automatización Inteligente',
        children: ['Teclas Smart', 'Control de Persianas', 'Dimmer Smart', 'Reflectores y Lámparas Smart', 'Sensores de movimiento'].map(leaf),
      },
      {
        label: 'Otros artefactos',
        to: '/products?category=Iluminación&sub=Otros artefactos',
        children: ['Lámparas LED', 'Lámparas PAR / Especiales', 'Lámparas Vintage y Filamento', 'Lámparas Gota y Globo', 'Lámparas Bulbón / High Power', 'Lámparas Bulbo', 'Lámparas Bipin (G4 / G9)', 'Lámparas Vela', 'Lámparas Fridge'].map(leaf),
      },
      {
        label: 'Tubos y Listones LED',
        to: '/products?category=Iluminación&sub=Tubos y Listones LED',
        children: ['Tubos LED', 'Estancos LED', 'Listones LED'].map(leaf),
      },
      {
        label: 'Iluminación para piscinas',
        to: '/products?category=Iluminación&sub=Iluminación para piscinas',
        children: ['Luces', 'Controladores'].map(leaf),
      },
      {
        label: 'Iluminación Decorativa',
        to: '/products?category=Iluminación&sub=Iluminación Decorativa',
        children: ['Guirnaldas LED', 'Tiras LED', 'Fuentes', 'Estacas', 'Lámparas Deco'].map(leaf),
      },
      {
        label: 'Reflectores LED',
        to: '/products?category=Iluminación&sub=Reflectores LED',
        children: ['Reflectores con Sensor', 'Reflectores Línea PRO', 'Reflectores Línea ECO'].map(leaf),
      },
      {
        label: 'Paneles y Plafones LED',
        to: '/products?category=Iluminación&sub=Paneles y Plafones LED',
        children: ['Paneles de Superficie / Plafones', 'Paneles Embutidos', 'Accesorios y Controladores'].map(leaf),
      },
      { label: 'Drivers y Fuentes de Emergencia', to: '/products?category=Iluminación&sub=Drivers y Fuentes de Emergencia' },
      {
        label: 'Apliques',
        to: '/products?category=Iluminación&sub=Apliques',
        children: [
          { label: 'Exterior', children: ['Emergencia', 'Solar', 'Reflectores', 'Apliques', 'Estacas'].map(leaf) },
        ],
      },
    ],
  },
  {
    label: 'Automatización',
    to: '/products?category=Automatización Industrial',
    children: [
      { label: 'Guardamotores', to: '/products?category=Automatización Industrial&sub=Guardamotores' },
      { label: 'Contactores', to: '/products?category=Automatización Industrial&sub=Contactores' },
      { label: 'Minicontactores', to: '/products?category=Automatización Industrial&sub=Minicontactores' },
      { label: 'Programadores', to: '/products?category=Automatización Industrial&sub=Programadores' },
      { label: 'Conmutadoras', to: '/products?category=Automatización Industrial&sub=Conmutadoras' },
      {
        label: 'Relés',
        to: '/products?category=Automatización Industrial&sub=Relés',
        children: ['Relés de Sobrecarga', 'Mini Reles'].map(leaf),
      },
      { label: 'Variadores de Velocidad', to: '/products?category=Automatización Industrial&sub=Variadores de Velocidad' },
      { label: 'Fuentes', to: '/products?category=Automatización Industrial&sub=Fuentes' },
      { label: 'Accesorios y Otros', to: '/products?category=Automatización Industrial&sub=Accesorios y Otros' },
    ],
  },
  {
    label: 'Promociones',
    to: '/products?category=Promociones',
  },
]

// Backfills `to` on every node that doesn't declare its own, using the
// closest ancestor's `to` — makes every subgrupo/leaf in the mega-menu
// clickable, landing on the deepest filter the catalog actually supports.
function inheritTo(nodes, inheritedTo) {
  return nodes.map((node) => {
    const to = node.to || inheritedTo
    return node.children
      ? { ...node, to, children: inheritTo(node.children, to) }
      : { ...node, to }
  })
}

export const CATEGORY_TREE = inheritTo(RAW_CATEGORY_TREE)
