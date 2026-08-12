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

export function isPublicAxisValueAvailable(rules, axis, value) {
  return (Array.isArray(rules) ? rules : []).some(rule => !rule?.[axis] || same(rule[axis], value))
}

export function hasPublicAxisFallback(rules, axis) {
  return (Array.isArray(rules) ? rules : []).some(rule => !rule?.[axis])
}
