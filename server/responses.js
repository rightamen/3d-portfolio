import { validateResponseShape } from './contracts/responseValidator.js'

export const API_ERROR_CODES = Object.freeze({
  ADMIN_AUTH_REQUIRED: 'ADMIN_AUTH_REQUIRED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  COMMUNITY_COMMENT_NOT_FOUND: 'COMMUNITY_COMMENT_NOT_FOUND',
  COMMUNITY_POST_NOT_FOUND: 'COMMUNITY_POST_NOT_FOUND',
  COMMUNITY_UPLOAD_NOT_FOUND: 'COMMUNITY_UPLOAD_NOT_FOUND',
  CONTACT_MESSAGE_NOT_FOUND: 'CONTACT_MESSAGE_NOT_FOUND',
  DOWNLOAD_REQUEST_NOT_FOUND: 'DOWNLOAD_REQUEST_NOT_FOUND',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  EMAIL_NOT_REGISTERED: 'EMAIL_NOT_REGISTERED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  HANDLE_TAKEN: 'HANDLE_TAKEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  PROFILE_ADMIN_DISABLED: 'PROFILE_ADMIN_DISABLED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_SLUG_TAKEN: 'PROJECT_SLUG_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  REQUEST_BODY_INVALID: 'REQUEST_BODY_INVALID',
  RESOURCE_FORBIDDEN: 'RESOURCE_FORBIDDEN',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VISITOR_NOT_FOUND: 'VISITOR_NOT_FOUND',
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

// Requests that arrived via the /api/v1/* prefix are tagged by the dual-mount
// rewrite middleware in server/index.js. v1 responses use the STRICT envelope:
// the top-level keys are exactly data/pagination/error — no legacy data mirror
// (withLegacyData) and no top-level code/message compatibility mirror. Legacy
// /api/* keeps both mirrors until the Web front end migrates to v1.
// See docs/API_V1_FREEZE_PLAN.md §3/§4/§14.
const isStrictV1 = (response) => response.req?.apiVersion === 'v1'

const sendStrictV1 = (response, payload, httpStatus) => {
  warnContractIssues(response, payload, {
    allowCompatibilityKeys: false,
    allowLegacyKeys: false,
  })
  return response.status(httpStatus).json(payload)
}

export const sendData = (response, data = {}, httpStatus = 200) => {
  if (isStrictV1(response)) {
    return sendStrictV1(response, { data, pagination: {}, error: null }, httpStatus)
  }

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
  if (isStrictV1(response)) {
    return sendStrictV1(response, { data, pagination, error: null }, httpStatus)
  }

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
  if (isStrictV1(response)) {
    return sendStrictV1(
      response,
      { data: null, pagination: {}, error: { code, message } },
      httpStatus,
    )
  }

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

// Classifies an error surfaced by the shared multer upload middleware into an
// envelope error descriptor, or returns null when the error is not an upload
// error (so callers fall through to the next error handler). Kept multer-free
// so it can be unit-tested without spinning up a server: multer raises
// instances whose `name` is 'MulterError' (limits, unexpected fields), while
// fileFilter rejections arrive as plain Errors. fileFilter callbacks attach a
// stable `error.code === 'INVALID_FILE_TYPE'` (see server/index.js) so
// classification does not depend on the human-readable message — different
// upload routes (community/admin vs. avatar/banner) use different messages
// for the same rejection. The message check below is kept only as a fallback
// for any error that reaches here without the stable code.
export const describeUploadError = (error) => {
  if (!error) return null

  if (error.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        code: API_ERROR_CODES.FILE_TOO_LARGE,
        message: error.message,
        httpStatus: 413,
      }
    }

    return {
      code: API_ERROR_CODES.FILE_UPLOAD_ERROR,
      message: error.message,
      httpStatus: 400,
    }
  }

  if (error.code === 'INVALID_FILE_TYPE' || error.message === 'Unsupported file type.') {
    return {
      code: API_ERROR_CODES.INVALID_FILE_TYPE,
      message: error.message,
      httpStatus: 400,
    }
  }

  return null
}
