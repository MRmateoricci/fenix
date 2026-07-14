// Zonas de envío — editá los precios según tus tarifas reales.
// El CP del cliente se compara contra los prefijos de cada zona (de más específico a menos).
// Si ninguna zona coincide, se muestra "Consultar por WhatsApp".

export const SHIPPING_ZONES = [
  {
    id: 'gratis',
    label: 'City Bell y alrededores',
    description: 'City Bell, Gonnet, Villa Elisa, Ringuelet',
    price: 0,
    prefixes: ['1894', '1895', '1896', '1897', '1898', '1899'],
  },
  {
    id: 'laplata',
    label: 'La Plata y Gran La Plata',
    description: 'La Plata, Tolosa, Los Hornos, Melchor Romero, Berisso, Ensenada',
    price: 2500,
    prefixes: ['1900', '1901', '1902', '1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910', '1911', '1912', '1913', '1914', '1915', '1923', '1924', '1925'],
  },
  {
    id: 'gba',
    label: 'GBA Sur y Este',
    description: 'Berazategui, Quilmes, Florencio Varela, Almirante Brown',
    price: 4500,
    prefixes: ['1870', '1875', '1876', '1877', '1878', '1879', '1880', '1881', '1882', '1883', '1884', '1885', '1886', '1887', '1888', '1850', '1851', '1852', '1853', '1854', '1855', '1856', '1858', '1860', '1861', '1862', '1864', '1865'],
  },
]

export const SHIPPING_FALLBACK = {
  label: 'Zona no disponible',
  description: 'Para tu zona coordinamos el envío por WhatsApp',
  price: null,
}

export function getShippingForCP(cp) {
  if (!cp || cp.trim().length < 4) return null
  const normalized = cp.trim().replace(/\s/g, '')
  for (const zone of SHIPPING_ZONES) {
    if (zone.prefixes.some(prefix => normalized.startsWith(prefix))) {
      return zone
    }
  }
  return SHIPPING_FALLBACK
}
