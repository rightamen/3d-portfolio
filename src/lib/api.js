const API_BASE = import.meta.env.VITE_API_BASE || ''

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const normalizeApiPayload = (payload) => {
  if (!isPlainObject(payload) || !hasOwn(payload, 'data') || !hasOwn(payload, 'error')) {
    return payload
  }

  if (isPlainObject(payload.data)) {
    return {
      ...payload.data,
      ...payload,
    }
  }

  return payload
}

const createApiError = (payload, fallbackMessage, status) => {
  const envelopeError = isPlainObject(payload?.error) ? payload.error : null
  const legacyError = typeof payload?.error === 'string' ? payload.error : ''
  const message =
    envelopeError?.message || legacyError || payload?.message || fallbackMessage
  const error = new Error(message)

  error.code = envelopeError?.code || payload?.code
  error.status = status
  error.payload = payload

  return error
}

const requestTimeoutMs = 15000

const buildRequestSignal = (signal) => {
  if (typeof AbortSignal === 'undefined') return signal

  const timeoutSignal =
    typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(requestTimeoutMs) : null
  if (!signal) return timeoutSignal || undefined
  if (!timeoutSignal || typeof AbortSignal.any !== 'function') return signal
  return AbortSignal.any([signal, timeoutSignal])
}

// A proxy or nginx error page returns HTML: parse it here so callers always see
// the shared api error shape instead of a bare SyntaxError.
const parseJsonBody = async (response) => {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    throw createApiError(null, 'Unexpected server response', response.status)
  }
}

const request = async (path, options = {}) => {
  const { signal, ...rest } = options
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    signal: buildRequestSignal(signal),
  })

  if (!response.ok) {
    const payload = await parseJsonBody(response).catch(() => ({}))
    throw createApiError(payload, 'Request failed', response.status)
  }

  return normalizeApiPayload(await parseJsonBody(response))
}

// Exchanges the static ADMIN_TOKEN for a short-lived session token. The
// dashboard stores only the result, so the permanent secret never sits in
// localStorage where any XSS could lift it and keep it forever.
export const createAdminSession = (staticToken) =>
  request('/api/admin/session', {
    cache: 'no-store',
    method: 'POST',
    headers: { Authorization: `Bearer ${staticToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

export const endAdminSession = (token) =>
  request('/api/admin/session', {
    cache: 'no-store',
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

// Sign-in for a named admin account: password plus a code from an
// authenticator app (or one recovery code). Yields the same kind of session the
// static token does, except this one is attributable to a person.
export const adminLogin = ({ password, recoveryCode, totp, username }) =>
  request('/api/admin/login', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password,
      ...(recoveryCode ? { recoveryCode } : {}),
      ...(totp ? { totp } : {}),
      username,
    }),
  })

export const getAdminMe = (token) => adminRequest('/api/admin/me', token, { cache: 'no-store' })

const adminRequest = (path, token, options = {}) =>
  request(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })

const authHeaders = (token, headers = {}) => ({
  ...headers,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

export const getProfile = () => request('/api/profile')
export const getProjects = () => request('/api/projects')
export const getProject = (slug) => request(`/api/projects/${slug}`)
export const getProjectInteractions = (slug) =>
  request(`/api/projects/${slug}/interactions`)
export const getExperience = () => request('/api/experience')

export const getCommunityUploads = () => request('/api/community/uploads')

export const getCommunityPosts = () => request('/api/community/posts')

export const getCurrentVisitor = (token) =>
  request('/api/auth/me', {
    cache: 'no-store',
    headers: authHeaders(token),
  })

export const loginVisitor = (payload) =>
  request('/api/auth/login', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const logoutVisitor = (token) =>
  request('/api/auth/logout', {
    cache: 'no-store',
    method: 'POST',
    headers: authHeaders(token),
  })

export const registerVisitor = (payload) =>
  request('/api/auth/register', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const verifyVisitorEmail = (payload) =>
  request('/api/auth/verify-email', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const resendVisitorVerification = (payload) =>
  request('/api/auth/resend-verification', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const requestPasswordReset = (payload) =>
  request('/api/auth/forgot-password', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const resetVisitorPassword = (payload) =>
  request('/api/auth/reset-password', {
    cache: 'no-store',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const changeVisitorPassword = (token, payload) =>
  request('/api/account/password', {
    cache: 'no-store',
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const requestEmailChange = (token, payload) =>
  request('/api/account/email', {
    cache: 'no-store',
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const confirmEmailChange = (token, payload) =>
  request('/api/account/email/confirm', {
    cache: 'no-store',
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const cancelEmailChange = (token) =>
  request('/api/account/email', {
    cache: 'no-store',
    method: 'DELETE',
    headers: authHeaders(token),
  })

export const revokeOtherSessions = (token) =>
  request('/api/account/sessions/revoke-all', {
    cache: 'no-store',
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ keepCurrent: true }),
  })

export const deleteVisitorAccount = (token, payload) =>
  request('/api/account', {
    cache: 'no-store',
    method: 'DELETE',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const toggleProjectLike = (slug, visitorId, token) =>
  request(`/api/projects/${slug}/like`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ visitorId }),
  })

export const addProjectComment = (slug, payload, token) =>
  request(`/api/projects/${slug}/comments`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const requestProjectDownload = (slug, payload, token) =>
  request(`/api/projects/${slug}/download-requests`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

// Downloads the gated source archive by way of a one-shot ticket.
//
// The archive needs authorization, and a plain <a href> cannot carry a bearer
// token — so this used to fetch() the whole file into a Blob and click a
// generated link. That put the entire archive in the tab's memory, which for a
// multi-hundred-megabyte source package is enough to kill the tab.
//
// Now the client asks for a short-lived single-use ticket and then navigates to
// the URL that carries it, letting the browser stream straight to disk with its
// own progress UI and resume behaviour.
export const downloadProjectSource = async (slug, token) => {
  const payload = await request(`/api/projects/${slug}/download-ticket`, {
    cache: 'no-store',
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })

  const url = payload?.ticket?.url
  if (!url) throw new Error('Download failed')

  // A hidden iframe rather than window.location so a download failure does not
  // navigate the SPA away from the project the visitor was reading.
  const frame = document.createElement('iframe')
  frame.style.display = 'none'
  frame.src = `${API_BASE}${url}`
  document.body.appendChild(frame)
  window.setTimeout(() => frame.remove(), 60000)

  return payload
}

export const uploadCommunityResource = (token, payload, file, onProgress) => {
  const formData = new FormData()
  formData.append('title', payload.title)
  formData.append('description', payload.description)
  formData.append('assetCategory', payload.assetCategory)
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/community/uploads`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      let responsePayload = {}
      try {
        responsePayload = JSON.parse(xhr.responseText || '{}')
      } catch {
        responsePayload = {}
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(normalizeApiPayload(responsePayload))
      } else {
        reject(createApiError(responsePayload, 'Upload failed', xhr.status))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(formData)
  })
}

export const createCommunityPost = (token, payload) =>
  request('/api/community/posts', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const getCommunityPost = (id) => request(`/api/community/posts/${id}`)

export const getCommunityComments = (id, { sort = 'newest', token } = {}) =>
  request(`/api/community/posts/${id}/comments?sort=${sort}`, {
    headers: authHeaders(token),
  })

export const createCommunityComment = (token, postId, payload) =>
  request(`/api/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

export const toggleCommunityCommentLike = (token, commentId) =>
  request(`/api/community/comments/${commentId}/like`, {
    method: 'POST',
    headers: authHeaders(token),
  })

export const deleteCommunityComment = (token, commentId) =>
  request(`/api/community/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })

export const getAccountCommunity = (token) =>
  request('/api/account/community', {
    headers: authHeaders(token),
  })

export const getAccountDownloads = (token) =>
  request('/api/account/downloads', {
    headers: authHeaders(token),
  })

export const getAccountComments = (token) =>
  request('/api/account/comments', {
    headers: authHeaders(token),
  })

export const getAccountProfile = (token) =>
  request('/api/account/profile', {
    headers: authHeaders(token),
  })

export const updateAccountProfile = (token, payload) =>
  request('/api/account/profile', {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

const uploadAccountImage = (token, endpoint, file, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${endpoint}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      let responsePayload = {}
      try {
        responsePayload = JSON.parse(xhr.responseText || '{}')
      } catch {
        responsePayload = {}
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(normalizeApiPayload(responsePayload))
      } else {
        reject(createApiError(responsePayload, 'Upload failed', xhr.status))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(formData)
  })
}

export const uploadAccountAvatar = (token, file, onProgress) =>
  uploadAccountImage(token, '/api/account/avatar', file, onProgress)

export const uploadAccountBanner = (token, file, onProgress) =>
  uploadAccountImage(token, '/api/account/banner', file, onProgress)

export const deleteAccountCommunityUpload = (token, id) =>
  request(`/api/account/community/uploads/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
export const deleteAccountCommunityPost = (token, id) =>
  request(`/api/account/community/posts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })

export const getPublicUserProfile = (handle) => request(`/api/users/${handle}`)

export const getPublicUserResources = (handle) =>
  request(`/api/users/${handle}/resources`)

export const getPublicUserPosts = (handle) => request(`/api/users/${handle}/posts`)

export const getPublicUserActivity = (handle) => request(`/api/users/${handle}/activity`)

export const getAdminSummary = (token) => adminRequest('/api/admin/summary', token)

export const getAdminComments = (token) => adminRequest('/api/admin/comments', token)

export const getAdminLikes = (token) => adminRequest('/api/admin/likes', token)

export const getAdminContactMessages = (token) =>
  adminRequest('/api/admin/contact-messages', token)

export const getAdminDownloadRequests = (token) =>
  adminRequest('/api/admin/download-requests', token)

export const getAdminProjects = (token) => adminRequest('/api/admin/projects', token)

export const getAdminVisitors = (token, filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
  return adminRequest(`/api/admin/visitors?${query.toString()}`, token)
}

export const getAdminVisitor = (token, id) =>
  adminRequest(`/api/admin/visitors/${id}`, token)

export const getAdminVisitorContent = (token, id, section, page = 1, limit = 20) =>
  adminRequest(
    `/api/admin/visitors/${id}/${section}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`,
    token,
  )

export const getAdminCommunityUploads = (token) =>
  adminRequest('/api/admin/community-uploads', token)

export const getAdminCommunityPosts = (token) =>
  adminRequest('/api/admin/community-posts', token)

export const getAdminCommunityComments = (token) =>
  adminRequest('/api/admin/community-comments', token)

export const createAdminProject = (token, payload) =>
  adminRequest('/api/admin/projects', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateAdminDownloadRequest = (token, id, status) =>
  adminRequest(`/api/admin/download-requests/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

export const updateAdminProject = (token, slug, payload) =>
  adminRequest(`/api/admin/projects/${slug}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateAdminVisitor = (token, id, accessLevel) =>
  adminRequest(`/api/admin/visitors/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessLevel }),
  })

export const updateAdminVisitorEmailVerification = (token, id, verified) =>
  adminRequest(`/api/admin/visitors/${id}/email-verification`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verified }),
  })

export const updateAdminVisitorProfileVisibility = (token, id, disabled, reason) =>
  adminRequest(`/api/admin/visitors/${id}/profile-visibility`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled, reason }),
  })

export const moderateAdminVisitorProfile = (token, id, clear, reason) =>
  adminRequest(`/api/admin/visitors/${id}/profile-moderation`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clear, reason }),
  })

export const deleteAdminVisitor = (token, id) =>
  adminRequest(`/api/admin/visitors/${id}`, token, {
    method: 'DELETE',
  })

export const updateAdminCommunityUpload = (token, id, status) =>
  adminRequest(`/api/admin/community-uploads/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

export const deleteAdminProject = (token, slug) =>
  adminRequest(`/api/admin/projects/${slug}`, token, {
    method: 'DELETE',
  })

export const uploadAdminAsset = (token, file, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${API_BASE}/api/admin/uploads`)
    request.setRequestHeader('Authorization', `Bearer ${token}`)

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    request.onload = () => {
      let payload = {}
      try {
        payload = JSON.parse(request.responseText || '{}')
      } catch {
        payload = {}
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(normalizeApiPayload(payload))
      } else {
        reject(createApiError(payload, 'Upload failed', request.status))
      }
    }

    request.onerror = () => reject(new Error('Upload failed'))
    request.send(formData)
  })
}

export const deleteAdminComment = (token, id) =>
  adminRequest(`/api/admin/comments/${id}`, token, {
    method: 'DELETE',
  })

export const deleteAdminContactMessage = (token, id) =>
  adminRequest(`/api/admin/contact-messages/${id}`, token, {
    method: 'DELETE',
  })

export const deleteAdminDownloadRequest = (token, id) =>
  adminRequest(`/api/admin/download-requests/${id}`, token, {
    method: 'DELETE',
  })

export const deleteAdminCommunityUpload = (token, id) =>
  adminRequest(`/api/admin/community-uploads/${id}`, token, {
    method: 'DELETE',
  })

export const deleteAdminCommunityPost = (token, id) =>
  adminRequest(`/api/admin/community-posts/${id}`, token, {
    method: 'DELETE',
  })

export const deleteAdminCommunityComment = (token, id) =>
  adminRequest(`/api/admin/community-comments/${id}`, token, {
    method: 'DELETE',
  })

export const sendMessage = (payload) =>
  request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
