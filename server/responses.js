import { validateResponseShape } from './contracts/responseValidator.js'

export const API_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  COMMUNITY_COMMENT_NOT_FOUND: 'COMMUNITY_COMMENT_NOT_FOUND',
  COMMUNITY_POST_NOT_FOUND: 'COMMUNITY_POST_NOT_FOUND',
  COMMUNITY_UPLOAD_NOT_FOUND: 'COMMUNITY_UPLOAD_NOT_FOUND',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  EMAIL_NOT_REGISTERED: 'EMAIL_NOT_REGISTERED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  HANDLE_TAKEN: 'HANDLE_TAKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  PROFILE_ADMIN_DISABLED: 'PROFILE_ADMIN_DISABLED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  RESOURCE_FORBIDDEN: 'RESOURCE_FORBIDDEN',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
})

const hasPlainObjectData = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)

// Spreads the data object's keys onto the top level alongside `data` so that
// legacy clients reading `payload.<key>` keep working during the envelope
// migration. WARNING: because these keys land at the top level, a data key
// named `data`, `pagination`, `error`, `code`, or `message` would collide with
// (and overwrite) the envelope/compatibility fields. New endpoints must avoid
// returning data keys with those reserved names.
const withLegacyData = (data) => ({
  data,
  ...(hasPlainObjectData(data) ? data : {}),
})

const warnContractIssues = (response, payload, options) => {
  const result = validateResponseShape(payload, options)
  if (result.valid) return

  const route = response.req?.originalUrl || response.req?.url || '<unknown>'
  console.warn(`[API CONTRACT WARNING] ${route}\n${result.issues.join('\n')}`)
}

export const sendData = (response, data = {}, httpStatus = 200) => {
  const legacyKeys = hasPlainObjectData(data) ? Object.keys(data) : []
  const payload = {
    ...withLegacyData(data),
    pagination: {},
    error: null,
  }

  warnContractIssues(response, payload, { legacyKeys })
  return response.status(httpStatus).json(payload)
}

export const sendPage = (response, data = {}, pagination = {}, httpStatus = 200) => {
  const legacyKeys = hasPlainObjectData(data) ? Object.keys(data) : []
  const payload = {
    ...withLegacyData(data),
    pagination,
    error: null,
  }

  warnContractIssues(response, payload, { legacyKeys })
  return response.status(httpStatus).json(payload)
}

export const sendError = (response, code, message, httpStatus = 400) => {
  const payload = {
    data: null,
    pagination: {},
    code,
    error: {
      code,
      message,
    },
    message,
  }

  warnContractIssues(response, payload)
  return response.status(httpStatus).json(payload)
}
