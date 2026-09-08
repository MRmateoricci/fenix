import test from 'node:test'
import assert from 'node:assert/strict'
import { priceImportError } from './priceImportError.js'

test('conserva los motivos de todos los archivos rechazados en el mensaje visible', () => {
  assert.equal(priceImportError({
    error: 'Ninguno de los archivos contiene una lista de precios válida',
    failedFiles: [
      { fileName: 'Lista A.xlsx', error: 'Hoja “Precios”: falta la columna de precio.' },
      { fileName: 'Lista B.xlsx', error: 'La hoja está vacía.' },
    ],
  }, 'Error'), 'Ninguno de los archivos contiene una lista de precios válida\nLista A.xlsx: Hoja “Precios”: falta la columna de precio.\nLista B.xlsx: La hoja está vacía.')
  assert.equal(priceImportError({}, 'No se pudo preparar la vista previa'), 'No se pudo preparar la vista previa')
})
