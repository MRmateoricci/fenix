// Script puntual: agrega 2 productos reales (con foto y descripción reales)
// a cada categoría pública que hoy se muestra en la home, para una demo al
// cliente. Se ejecuta una vez con `node db/seedDemoProducts.js` y no forma
// parte del arranque normal del backend.
import 'dotenv/config'
import { pool } from './pool.js'

const products = [
  // ── Electricidad ──────────────────────────────────────────────────────
  {
    codigo: 'DEMO-001',
    name: 'Schneider Electric Easy9 Interruptor Termomagnético Bipolar 6A',
    category: 'Electricidad',
    subcategory: 'Disyuntores',
    product_type: 'Bipolares',
    precio_venta: 14900,
    descripcion_larga: 'Interruptor termomagnético Schneider Electric serie Easy9, bipolar, 6 A, curva C, poder de corte 4,5 kA a 230/400 V~. Protección contra sobrecargas y cortocircuitos para instalaciones residenciales y comerciales. Montaje sobre riel DIN, terminales con marcado claro para una instalación rápida. Ref. EZ9F34206.',
    image_url: 'https://ddkjx5kezodfx.cloudfront.net/Weyop/BP/Store/Productos/Interruptores%20para%20Riel%20Din/1718052569_RVo5RjM0MjE2.webp',
    hover_image_url: '',
    ip_rating: 'IP20',
    material: 'Termoplástico autoextinguible',
    stock: 30,
  },
  {
    codigo: 'DEMO-002',
    name: 'Legrand Plexo Caja de Derivación Estanca IP55 105x105x55',
    category: 'Electricidad',
    subcategory: 'Cajas y Cuadros de Distribución',
    product_type: 'Cajas de Derivación',
    precio_venta: 11200,
    descripcion_larga: 'Caja de derivación estanca Legrand serie Plexo, 105×105×55 mm, con 7 entradas de cable mediante conos precortados y tapa de cierre a 1/4 de vuelta. Grado de protección IP55 e IK07, apta para instalaciones a la intemperie. Color gris, clase térmica 650 °C. Ref. 092022.',
    image_url: 'https://assets.legrand.com/pim/PHOTOS-WEB/LG-092022-WEB-R.jpg',
    hover_image_url: '',
    ip_rating: 'IP55',
    material: 'Termoplástico',
    stock: 22,
  },

  // ── Iluminación ───────────────────────────────────────────────────────
  {
    codigo: 'DEMO-003',
    name: 'Philips MASTER Value LEDbulb A60 60W E27',
    category: 'Iluminación',
    subcategory: 'Otros artefactos',
    product_type: 'Lámparas LED',
    precio_venta: 7800,
    descripcion_larga: 'Lámpara LED Philips MASTER Value A60, casquillo E27, equivalente a 60 W con 806 lúmenes y luz blanca cálida 2700 K. Índice de reproducción cromática CRI90, vida útil de 15.000 horas y encendido instantáneo sin parpadeo. Vidrio esmerilado, ideal para lectura y ambientes hogareños.',
    image_url: 'https://www.assets.signify.com/is/image/Signify/LED_BulbsBulb_A67_100W_1521lm_2700K_E27_NDFrosted-SPP?wid=600&hei=600&qlt=82',
    hover_image_url: '',
    color_temp: 2700,
    ip_rating: 'IP20',
    watts: 7,
    material: 'Vidrio',
    stock: 45,
  },
  {
    codigo: 'DEMO-004',
    name: 'OSRAM Endura Flood 50W Reflector LED Exterior',
    category: 'Iluminación',
    subcategory: 'Reflectores LED',
    product_type: 'Reflectores Línea ECO',
    precio_venta: 69900,
    descripcion_larga: 'Reflector LED exterior OSRAM Endura Flood 50 W, 5250 lúmenes, luz blanca cálida 3000 K. Cuerpo de aluminio color grafito, soporte giratorio 180°, certificación IP65 apta para lluvia y humedad. Ahorra hasta un 80% de energía frente a un reflector halógeno equivalente, garantía de 3 años.',
    image_url: 'https://shop.ledvance.com/cdn/shop/files/asset-13279606.jpg?v=1757077412&width=1000',
    hover_image_url: 'https://shop.ledvance.com/cdn/shop/files/asset-13076409.jpg?v=1758023968&width=1499',
    color_temp: 3000,
    ip_rating: 'IP65',
    watts: 50,
    material: 'Aluminio',
    stock: 15,
  },

  // ── Herramientas ──────────────────────────────────────────────────────
  {
    codigo: 'DEMO-005',
    name: 'Bosch GSB 13 RE Taladro Percutor 600W',
    category: 'Herramientas',
    subcategory: 'Herramientas Eléctricas',
    product_type: 'Taladros y Rotopercutores',
    precio_venta: 219900,
    descripcion_larga: 'Taladro percutor Bosch Professional GSB 13 RE, motor de 600 W y velocidad variable de 0 a 2800 rpm. Perfora hasta 13 mm en hormigón, 25 mm en madera y 10 mm en acero. Mandril de cambio rápido de metal, empuñadura lateral y tope de profundidad incluidos; diseño compacto de 1,8 kg.',
    image_url: 'https://www.bosch-professional.com/es/es/ocsmedia/377235-54/application-image/1434x828/taladro-con-percusion-pro-gsb-13-re-0601217100.png',
    hover_image_url: '',
    watts: 600,
    material: 'Plástico técnico y metal',
    stock: 6,
  },
  {
    codigo: 'DEMO-006',
    name: 'DeWalt DCD771C2-QW Taladro Atornillador Inalámbrico 18V',
    category: 'Herramientas',
    subcategory: 'Herramientas Inalámbricas',
    product_type: 'Taladros Inalámbricos',
    precio_venta: 389900,
    descripcion_larga: 'Taladro atornillador inalámbrico DeWalt DCD771C2-QW, 18 V XR Li-Ion, con par máximo de 42 Nm y 2 velocidades (0-450 / 0-1500 rpm). Portabrocas de 13 mm de autoapriete, 16 posiciones de par y luz LED. Incluye 2 baterías de 1,3 Ah, cargador multivoltaje y maletín TSTAK.',
    image_url: 'https://latejeraferreteria.com/3699-large_default/dewalt-taladro-atornillador-bateria-18v-dcd771c2-qw.jpg',
    hover_image_url: '',
    material: 'Plástico técnico',
    stock: 4,
  },

  // ── Automatización Industrial ────────────────────────────────────────
  {
    codigo: 'DEMO-007',
    name: 'ABB MS116-16 Guardamotor 10-16A',
    category: 'Automatización Industrial',
    subcategory: 'Guardamotores',
    precio_venta: 138900,
    descripcion_larga: 'Guardamotor ABB MS116-16, rango de regulación 10-16 A, para protección y maniobra manual de motores trifásicos contra sobrecargas y cortocircuitos. Capacidad de corte Ics hasta 100 kA, indicación de disparo magnético y función de desconexión. Montaje sobre riel DIN, IP20.',
    image_url: 'https://tienda.cruzzolin.com.ar/wp-content/uploads/2023/03/interruptores.jeluz-23.png',
    hover_image_url: '',
    ip_rating: 'IP20',
    material: 'Termoplástico y metal',
    stock: 8,
  },
  {
    codigo: 'DEMO-008',
    name: 'Schneider Electric TeSys D LC1D09BD Contactor 9A',
    category: 'Automatización Industrial',
    subcategory: 'Contactores',
    precio_venta: 94900,
    descripcion_larga: 'Contactor Schneider Electric TeSys D LC1D09BD, 3 polos, 9 A (AC-3), hasta 4 kW a 400 V. Bobina de comando 24 V DC, contactos auxiliares 1 NA + 1 NC integrados. Ideal para arranque directo de motores trifásicos en tableros de comando industrial.',
    image_url: 'https://cdn11.bigcommerce.com/s-83bhjx/images/stencil/1280x1280/products/16656/28668/LC1D09__79553.1773921005.jpg?c=2',
    hover_image_url: '',
    ip_rating: 'IP20',
    material: 'Termoplástico y metal',
    stock: 10,
  },
]

async function main() {
  for (const p of products) {
    await pool.query(
      `INSERT INTO products (
         codigo, name, category, subcategory, product_type, description_larga,
         precio_venta, image_url, hover_image_url,
         color_temp, ip_rating, watts, material,
         stock, stock_inmediato, source, published
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14 > 0,'manual',true)
       ON CONFLICT (codigo) DO NOTHING`,
      [
        p.codigo, p.name, p.category, p.subcategory, p.product_type ?? null,
        p.descripcion_larga, p.precio_venta, p.image_url, p.hover_image_url,
        p.color_temp ?? null, p.ip_rating ?? null, p.watts ?? null, p.material ?? null,
        p.stock,
      ]
    )
    console.log('OK', p.codigo, p.name)
  }
  await pool.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
