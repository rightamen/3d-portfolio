import { validateResponseShape } from './contracts/responseValidator.js'

export const API_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  COMMUNITY_POST_NOT_FOUND: 'COMMUNITY_POST_NOT_FOUND',
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
