const same = (left, right) => String(left || '').localeCompare(String(right || ''), 'es-AR', { sensitivity: 'base' }) === 0

export function publicRuleSpecificity(rule) {
  return ['color', 'size', 'tone'].reduce((total, key) => total + (rule?.[key] ? 1 : 0), 0)
}

export function publicRuleMatches(rule, selection) {
  return (!rule.color || same(rule.color, selection.color)) &&
    (!rule.size || same(rule.size, selection.size)) &&
    (!rule.tone || same(rule.tone, selection.tone))
}

export function resolvePublicVariantRule(rules, selection, field) {
  const matches = (Array.isArray(rules) ? rules : [])
    .filter(rule => rule?.[field] != null && publicRuleMatches(rule, selection))
    .sort((left, right) => publicRuleSpecificity(right) - publicRuleSpecificity(left))
  if (!matches.length) return null
  if (matches[1] && publicRuleSpecificity(matches[0]) === publicRuleSpecificity(matches[1])) return null
  return matches[0]
}

export function hasMatchingPublicRule(rules, selection) {
  return (Array.isArray(rules) ? rules : []).some(rule => publicRuleMatches(rule, selection))
}

// Devuelve una combinación pública válida que contenga el valor que el usuario
// acaba de elegir. Primero intenta conservar los otros ejes; si esa combinación
// no existe, busca la variante válida que más selecciones actuales mantenga.
// Una propiedad vacía en una regla funciona como comodín para ese eje.
export function findCompatiblePublicSelection(rules, choices, selection, changedAxis, changedValue) {
  const normalizedRules = Array.isArray(rules) ? rules : []
  const directSelection = { ...selection, [changedAxis]: changedValue || undefined }
  if (!normalizedRules.length || hasMatchingPublicRule(normalizedRules, directSelection)) return directSelection

  const axes = ['color', 'size', 'tone']
  const valuesByAxis = Object.fromEntries(axes.map(axis => {
    if (axis === changedAxis) return [axis, [changedValue || undefined]]
    const values = Array.isArray(choices?.[axis]) && choices[axis].length ? choices[axis] : [undefined]
    return [axis, [undefined, ...values].filter((value, index, all) =>
      all.findIndex(candidate => same(candidate, value)) === index
    )]
  }))
  let best = null
  let bestScore = -1

  for (const color of valuesByAxis.color) {
    for (const size of valuesByAxis.size) {
      for (const tone of valuesByAxis.tone) {
        const candidate = { color, size, tone }
        if (!hasMatchingPublicRule(normalizedRules, candidate)) continue
        const score = axes.reduce((total, axis) =>
          axis !== changedAxis && same(candidate[axis], selection?.[axis]) ? total + 1 : total
        , 0)
        if (score > bestScore) {
          best = candidate
          bestScore = score
        }
      }
    }
  }

  return best
}

export function isPublicAxisValueAvailable(rules, axis, value) {
  return (Array.isArray(rules) ? rules : []).some(rule => !rule?.[axis] || same(rule[axis], value))
}

export function hasPublicAxisFallback(rules, axis) {
  return (Array.isArray(rules) ? rules : []).some(rule => !rule?.[axis])
}
