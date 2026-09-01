// Full catalog taxonomy for the header "Categoría" mega-menu.
// This is the single source of truth for both the header mega-menu and the
// filters shown on /products. Top-level nodes are product categories, their
// children are subcategories and the next level is the product type.

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

function addParam(to, key, value) {
  const [pathname, query = ''] = to.split('?')
  const params = new URLSearchParams(query)
  params.set(key, value)
  return `${pathname}?${params.toString()}`
}

// Nodes on level 3 receive their own generic `type` filter. Cables keep their
// existing `ctype` URLs for backwards compatibility. Deeper nodes inherit the
// level-3 URL because the storefront product model intentionally stops there.
function addFilterLinks(nodes, inheritedTo) {
  return nodes.map((node) => {
    let to = node.to || inheritedTo

    if (!node.to && inheritedTo) {
      const query = inheritedTo.split('?')[1] || ''
      const params = new URLSearchParams(query)
      const isSubcategory = params.has('category') && params.has('sub')
      const alreadyHasType = params.has('type') || params.has('ctype')
      if (isSubcategory && !alreadyHasType) to = addParam(inheritedTo, 'type', node.label)
    }

    return node.children
      ? { ...node, to, children: addFilterLinks(node.children, to) }
      : { ...node, to }
  })
}

export const CATEGORY_TREE = addFilterLinks(RAW_CATEGORY_TREE)

// Mantiene la navegacion rapida que existia antes de que esta preferencia
// pudiera editarse. Las categorias nuevas quedan fuera hasta que el admin las
// marque expresamente.
export const DEFAULT_HEADER_CATEGORY_VALUES = [
  'Electricidad',
  'Iluminación',
  'Herramientas',
  'Automatización Industrial',
]

const DEFAULT_HEADER_CATEGORIES = new Set(DEFAULT_HEADER_CATEGORY_VALUES)

export function getCategoryValue(node) {
  const query = node?.to?.split('?')[1] || ''
  return new URLSearchParams(query).get('category')
}

function customization(customizations, level, category, subcategory = '', name = '') {
  return customizations.find(item => (
    item.level === level && item.category === category &&
    (item.subcategory || '') === subcategory && (item.name || '') === name
  ))
}

function taxonomyLink(category, subcategory = '', type = '', originalTo = '') {
  const params = new URLSearchParams(originalTo.split('?')[1] || '')
  params.set('category', category)
  if (subcategory) params.set('sub', subcategory)
  else params.delete('sub')
  if (type) {
    const typeKey = params.has('ctype') ? 'ctype' : 'type'
    params.delete('ctype')
    params.delete('type')
    params.set(typeKey, type)
  }
  return `/products?${params.toString()}`
}

// Agrega al árbol estático las subcategorías y tipos que el admin cargó a
// mano (tablas `subcategories`/`product_types`, ver AdminContext). Se usa
// tanto en el mega-menú del header como en los filtros de /products y el
// panel de admin, para que lo agregado se vea reflejado en todos lados.
export function buildCategoryTree(customSubcategories = [], customProductTypes = [], customizations = []) {
  const factoryCategories = new Set(CATEGORY_TREE.map(getCategoryValue))
  const factoryNodes = CATEGORY_TREE.flatMap((sourceCatNode) => {
    const sourceCategory = getCategoryValue(sourceCatNode)
    const categoryChange = customization(customizations, 'category', sourceCategory)
    if (categoryChange?.hidden) return []
    const category = categoryChange?.label || sourceCategory
    const showInHeader = typeof categoryChange?.show_in_header === 'boolean'
      ? categoryChange.show_in_header
      : DEFAULT_HEADER_CATEGORIES.has(sourceCategory)
    const catNode = {
      ...sourceCatNode,
      label: categoryChange?.label || sourceCatNode.label,
      to: taxonomyLink(category),
      showInHeader,
      _taxonomy: { source: 'factory', level: 'category', category: sourceCategory, subcategory: '', name: '' },
    }
    const existingChildren = (sourceCatNode.children || []).flatMap((sourceSubNode) => {
      const sourceSubcategory = sourceSubNode.label
      const subChange = customization(customizations, 'subcategory', sourceCategory, '', sourceSubcategory)
      if (subChange?.hidden) return []
      const subcategory = subChange?.label || sourceSubcategory
      const children = (sourceSubNode.children || []).flatMap((sourceTypeNode) => {
        const sourceType = sourceTypeNode.label
        const typeChange = customization(customizations, 'type', sourceCategory, sourceSubcategory, sourceType)
        if (typeChange?.hidden) return []
        const type = typeChange?.label || sourceType
        return [{
          ...sourceTypeNode,
          label: type,
          to: taxonomyLink(category, subcategory, type, sourceTypeNode.to || sourceSubNode.to),
          _taxonomy: {
            source: 'factory', level: 'type', category: sourceCategory,
            subcategory: sourceSubcategory, name: sourceType,
          },
        }]
      })
      return [{
        ...sourceSubNode,
        label: subcategory,
        to: taxonomyLink(category, subcategory, '', sourceSubNode.to),
        children: children.length ? children : undefined,
        _taxonomy: {
          source: 'factory', level: 'subcategory', category: sourceCategory,
          subcategory: '', name: sourceSubcategory,
        },
      }]
    })
    const existingLabels = existingChildren.map((node) => node.label)

    const childrenWithExtraTypes = existingChildren.map((subNode) => {
      const extraTypes = customProductTypes.filter(
        (t) => t.category === category && t.subcategory === subNode.label
      )
      if (!extraTypes.length) return subNode
      const existingTypeLabels = (subNode.children || []).map((node) => node.label)
      const newLeaves = extraTypes
        .filter((t) => !existingTypeLabels.includes(t.name))
        .map((t) => ({
          label: t.name,
          to: addParam(subNode.to, 'type', t.name),
          _taxonomy: { source: 'custom', level: 'type', id: t.id },
        }))
      return newLeaves.length ? { ...subNode, children: [...(subNode.children || []), ...newLeaves] } : subNode
    })

    const newSubcategories = customSubcategories
      .filter((s) => s.category === category && !existingLabels.includes(s.name))
      .map((s) => {
        const subTo = addParam(catNode.to, 'sub', s.name)
        const types = customProductTypes
          .filter((t) => t.category === category && t.subcategory === s.name)
          .map((t) => ({ label: t.name, to: addParam(subTo, 'type', t.name) }))
        return {
          label: s.name,
          to: subTo,
          children: types.length ? types.map(t => ({
            ...t,
            _taxonomy: { source: 'custom', level: 'type', id: customProductTypes.find(item => (
              item.category === category && item.subcategory === s.name && item.name === t.label
            ))?.id },
          })) : undefined,
          _taxonomy: { source: 'custom', level: 'subcategory', id: s.id },
        }
      })

    return [{ ...catNode, children: [...childrenWithExtraTypes, ...newSubcategories] }]
  })

  // Una personalización de categoría cuya clave no existe en el árbol de
  // fábrica representa una categoría principal creada desde el administrador.
  // Usa la misma tabla que los renombres para no sumar otra fuente de verdad.
  const customNodes = customizations
    .filter(item => (
      item.level === 'category' && !factoryCategories.has(item.category) && !item.hidden
    ))
    .map(item => {
      const category = item.label || item.category
      const categoryTo = taxonomyLink(category)
      const children = customSubcategories
        .filter(subcategory => subcategory.category === category)
        .map(subcategory => {
          const subcategoryTo = addParam(categoryTo, 'sub', subcategory.name)
          const types = customProductTypes
            .filter(type => type.category === category && type.subcategory === subcategory.name)
            .map(type => ({
              label: type.name,
              to: addParam(subcategoryTo, 'type', type.name),
              _taxonomy: { source: 'custom', level: 'type', id: type.id },
            }))

          return {
            label: subcategory.name,
            to: subcategoryTo,
            children: types.length ? types : undefined,
            _taxonomy: { source: 'custom', level: 'subcategory', id: subcategory.id },
          }
        })

      return {
        label: category,
        to: categoryTo,
        showInHeader: item.show_in_header === true,
        children,
        _taxonomy: {
          source: 'custom', level: 'category', category: item.category,
          subcategory: '', name: '',
        },
      }
    })

  return [...factoryNodes, ...customNodes]
}

export function getCategoryNode(category, tree = CATEGORY_TREE) {
  return tree.find((node) => getCategoryValue(node) === category) || null
}

export function getSubcategoryOptions(category, tree = CATEGORY_TREE) {
  return getCategoryNode(category, tree)?.children || []
}

export function getProductTypeOptions(category, subcategory, tree = CATEGORY_TREE) {
  return getSubcategoryOptions(category, tree).find((node) => node.label === subcategory)?.children || []
}
