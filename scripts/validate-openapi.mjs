import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { API_ERROR_CODES } from '../server/responses.js'

const require = createRequire(import.meta.url)

let yaml
try {
  yaml = require('js-yaml')
} catch (error) {
  console.error(
    [
      '[openapi] Unable to load js-yaml.',
      'This project expects js-yaml to be available from the existing dependency tree.',
      'Run npm install first, or add an explicit lightweight YAML parser dependency in a dedicated change.',
      `Original error: ${error.message}`,
    ].join('\n'),
  )
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const openApiPath = path.join(rootDir, 'docs/openapi/api-v1.yaml')

const failures = []

const fail = (message) => {
  failures.push(message)
}

const asArray = (value) => (Array.isArray(value) ? value : [])
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const readSpec = () => {
  let source
  try {
    source = fs.readFileSync(openApiPath, 'utf8')
  } catch (error) {
    fail(`Unable to read ${path.relative(rootDir, openApiPath)}: ${error.message}`)
    return null
  }

  try {
    return yaml.load(source)
  } catch (error) {
    fail(`YAML parse failed: ${error.message}`)
    return null
  }
}

const decodePointerSegment = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~')

const resolveJsonPointer = (document, ref) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return { ok: false, reason: 'only local JSON pointer refs are allowed' }
  }

  const segments = ref.slice(2).split('/').map(decodePointerSegment)
  let current = document

  for (const segment of segments) {
    if (!isObject(current) && !Array.isArray(current)) {
      return { ok: false, reason: `cannot descend into non-object at ${segment}` }
    }
    if (!(segment in current)) {
      return { ok: false, reason: `missing segment "${segment}"` }
    }
    current = current[segment]
  }

  return { ok: true, value: current }
}

const collectRefs = (value, refs = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, refs))
    return refs
  }

  if (!isObject(value)) return refs

  if (typeof value.$ref === 'string') refs.push(value.$ref)

  for (const child of Object.values(value)) {
    collectRefs(child, refs)
  }

  return refs
}

const schemaRefName = (ref) => {
  const prefix = '#/components/schemas/'
  return typeof ref === 'string' && ref.startsWith(prefix) ? ref.slice(prefix.length) : null
}

const schemaUsesEnvelope = (document, schema, seen = new Set()) => {
  if (!isObject(schema)) return false

  if (typeof schema.$ref === 'string') {
    const name = schemaRefName(schema.$ref)
    if (name === 'ResponseEnvelope' || name === 'ErrorEnvelope') return true
    if (seen.has(schema.$ref)) return false
    seen.add(schema.$ref)

    const resolved = resolveJsonPointer(document, schema.$ref)
    return resolved.ok && schemaUsesEnvelope(document, resolved.value, seen)
  }

  return ['allOf', 'oneOf', 'anyOf'].some((key) =>
    asArray(schema[key]).some((child) => schemaUsesEnvelope(document, child, seen)),
  )
}

const operationMethods = new Set([
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
])

const validateStrictEnvelopeSchema = (schemas) => {
  const envelope = schemas.ResponseEnvelope
  if (!isObject(envelope)) return

  const propertyKeys = Object.keys(envelope.properties || {}).sort()
  const requiredKeys = asArray(envelope.required).slice().sort()
  const expected = ['data', 'error', 'pagination']

  if (JSON.stringify(propertyKeys) !== JSON.stringify(expected)) {
    fail(`ResponseEnvelope properties must be exactly ${expected.join(', ')}; got ${propertyKeys.join(', ')}`)
  }

  if (JSON.stringify(requiredKeys) !== JSON.stringify(expected)) {
    fail(`ResponseEnvelope required keys must be exactly ${expected.join(', ')}; got ${requiredKeys.join(', ')}`)
  }

  if (envelope.additionalProperties !== false) {
    fail('ResponseEnvelope must set additionalProperties: false for strict /api/v1 top-level keys')
  }
}

const validateResponseSchemasUseEnvelope = (document) => {
  for (const [route, pathItem] of Object.entries(document.paths || {})) {
    if (!isObject(pathItem)) continue

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operationMethods.has(method) || !isObject(operation)) continue

      for (const [status, responseObject] of Object.entries(operation.responses || {})) {
        const resolvedResponse = responseObject?.$ref
          ? resolveJsonPointer(document, responseObject.$ref).value
          : responseObject

        if (!isObject(resolvedResponse)) {
          fail(`${method.toUpperCase()} ${route} ${status} response is not an object`)
          continue
        }

        const jsonContent = resolvedResponse.content?.['application/json']
        const schema = jsonContent?.schema
        if (!schema) continue

        if (!schemaUsesEnvelope(document, schema)) {
          fail(`${method.toUpperCase()} ${route} ${status} application/json schema does not use ResponseEnvelope/ErrorEnvelope`)
        }
      }
    }
  }
}

const validateErrorCodes = (document) => {
  const specCodes = asArray(document.components?.schemas?.ApiErrorCode?.enum).slice().sort()
  const serverCodes = Object.values(API_ERROR_CODES).slice().sort()

  const missing = serverCodes.filter((code) => !specCodes.includes(code))
  const extra = specCodes.filter((code) => !serverCodes.includes(code))

  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) fail(`OpenAPI ApiErrorCode enum is missing: ${missing.join(', ')}`)
    if (extra.length > 0) fail(`OpenAPI ApiErrorCode enum has extra values: ${extra.join(', ')}`)
  }
}

const spec = readSpec()

if (spec) {
  if (!spec.openapi) fail('Missing required top-level openapi field')
  if (!isObject(spec.paths) || Object.keys(spec.paths).length === 0) {
    fail('Missing or empty top-level paths object')
  }
  if (!isObject(spec.components?.schemas)) {
    fail('Missing components.schemas object')
  }

  const schemas = spec.components?.schemas || {}
  for (const schemaName of ['ResponseEnvelope', 'ApiError', 'Pagination']) {
    if (!isObject(schemas[schemaName])) {
      fail(`Missing components.schemas.${schemaName}`)
    }
  }

  for (const ref of collectRefs(spec)) {
    const resolved = resolveJsonPointer(spec, ref)
    if (!resolved.ok) fail(`Unresolved $ref ${ref}: ${resolved.reason}`)
  }

  validateStrictEnvelopeSchema(schemas)
  validateResponseSchemasUseEnvelope(spec)
  validateErrorCodes(spec)
}

if (failures.length > 0) {
  console.error(`[openapi] Validation failed with ${failures.length} issue(s):`)
  failures.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[openapi] docs/openapi/api-v1.yaml validation passed')
console.log(`[openapi] checked ${collectRefs(spec).length} local $ref(s)`)
console.log(`[openapi] checked ${Object.values(API_ERROR_CODES).length} API error code(s)`)
