export function redactArcaSecrets(value) {
  return String(value ?? '')
    .replace(/<token\b[^>]*>[\s\S]*?<\/token>/gi, '<token>[REDACTADO]</token>')
    .replace(/<sign\b[^>]*>[\s\S]*?<\/sign>/gi, '<sign>[REDACTADO]</sign>')
    .replace(/<in0\b[^>]*>[\s\S]*?<\/in0>/gi, '<in0>[REDACTADO]</in0>')
    .replace(/(["']?(?:token|sign|cms)["']?\s*[:=]\s*["'])[^"']+/gi, '$1[REDACTADO]');
}

export function safeArcaErrorMessage(error, maxCauses = 4) {
  const messages = [];
  let current = error;
  while (current && messages.length < maxCauses) {
    if (current.message && !messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return redactArcaSecrets(messages.join(' | Causa: ') || 'Error desconocido');
}
