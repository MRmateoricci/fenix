export function arcaEnvironmentLabel(config) {
  return config.isProduction ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN';
}

export function printSafeQueryBanner(config) {
  console.log(`AMBIENTE: ${arcaEnvironmentLabel(config)}`);
  console.log('NO SE EMITIRÁN COMPROBANTES');
  console.log('');
}

export function printEmissionBanner(config) {
  console.log('============================================================');
  console.log(`EMISIÓN DE COMPROBANTE — AMBIENTE: ${arcaEnvironmentLabel(config)}`);
  console.log('ESTE SCRIPT PUEDE SOLICITAR UN CAE');
  console.log('============================================================');
}
