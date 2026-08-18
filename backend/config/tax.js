// La tienda publica importes finales con una única alícuota. Esta constante
// centraliza la regla histórica del ecommerce para que catálogo y facturación
// no puedan divergir mientras no exista una alícuota persistida por producto.
export const DEFAULT_VAT_RATE = 21;
export const IVA_MULTIPLIER = 1 + (DEFAULT_VAT_RATE / 100);

// Umbral vigente consultado en ARCA para identificar al consumidor final.
// Está aislado para que un cambio normativo no quede disperso en validaciones.
export const CONSUMER_FINAL_IDENTIFICATION_THRESHOLD = 10_000_000;
