// Alturas del layout fijo (announcement bar + navbar), en un solo lugar para
// que el offset de scroll del navbar y el padding-top de las páginas nunca
// diverjan entre sí.
export const NAVBAR_HEIGHT = 64
export const ANNOUNCEMENT_BAR_HEIGHT = 36
export const ANNOUNCEMENT_BAR_HEIGHT_MOBILE = 34

// Espacio reservado arriba del contenido cuando el navbar (fixed) está en su
// posición de reposo, sin scrollear todavía.
export const PAGE_CONTENT_OFFSET = NAVBAR_HEIGHT + ANNOUNCEMENT_BAR_HEIGHT
