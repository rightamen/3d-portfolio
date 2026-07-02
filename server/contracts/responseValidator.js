const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const formatPath = (path, key) => (path ? `${path}.${key}` : key)

const findUndefinedFields = (value, path = '') => {
  if (value === undefined) return [path || '<root>']
  if (!isPlainObject(value) && !Array.isArray(value)) return []

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value)

  return entries.flatMap(([key, item]) => findUndefinedFields(item, formatPath(path, key)))
}

export const validateResponseShape = (
  payload,
  {
    allowCompatibilityKeys = true,
    allowLegacyKeys = true,
    legacyKeys = [],
  } = {},
) => {
  const issues = []

  if (!isPlainObject(payload)) {
    return {
      issues: ['response payload must be an object'],
      valid: false,
    }
  }

  for (const key of ['data', 'pagination', 'error']) {
    if (!hasOwn(payload, key)) issues.push(`missing ${key} field`)
  }

  if (hasOwn(payload, 'pagination') && !isPlainObject(payload.pagination)) {
    issues.push('pagination must be an object')
  }

  const undefinedFields = findUndefinedFields(payload)
  for (const field of undefinedFields) {
    issues.push(`${field} must not be undefined`)
  }

  if (hasOwn(payload, 'error')) {
    if (payload.error === null) {
      if (payload.data === null) issues.push('successful response data must not be null')
    } else if (isPlainObject(payload.error)) {
      if (payload.data !== null) issues.push('error response data must be null')
      if (typeof payload.error.code !== 'string' || !payload.error.code.trim()) {
        issues.push('error.code must be a non-empty string')
      }
      if (typeof payload.error.message !== 'string') {
        issues.push('error.message must be a string')
      }
    } else {
      issues.push('error must be null or an object')
    }
  }

  const allowedKeys = new Set(['data', 'pagination', 'error'])
  if (allowCompatibilityKeys) {
    allowedKeys.add('code')
    allowedKeys.add('message')
  }
  if (allowLegacyKeys) {
    for (const key of legacyKeys) allowedKeys.add(key)
  }

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      issues.push(`unexpected top-level field: ${key}`)
    }
  }

  if (allowLegacyKeys && isPlainObject(payload.data)) {
    for (const key of legacyKeys) {
      if (hasOwn(payload, key) && !hasOwn(payload.data, key)) {
        issues.push(`legacy field ${key} must also exist in data`)
      }
    }
  }

  return {
    issues,
    valid: issues.length === 0,
  }
}
