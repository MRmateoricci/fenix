export function priceImportError(data, fallback) {
  const details = (data.failedFiles || []).map(file => `${file.fileName}: ${file.error}`)
  return [data.error || fallback, ...details].join('\n')
}
