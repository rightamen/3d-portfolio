const API_BASE = import.meta.env.VITE_API_BASE || ''

const request = async (path, options) => {
  const response = await fetch(`${API_BASE}${path}`, options)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed')
  }

  return response.json()
}

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

export const getCurrentVisitor = (token) =>
  request('/api/auth/me', {
    headers: authHeaders(token),
  })

export const loginVisitor = (payload) =>
  request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const logoutVisitor = (token) =>
  request('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders(token),
  })

export const registerVisitor = (payload) =>
  request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        resolve(responsePayload)
      } else {
        reject(new Error(responsePayload.error || 'Upload failed'))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(formData)
  })
}

export const getAdminSummary = (token) => adminRequest('/api/admin/summary', token)

export const getAdminComments = (token) => adminRequest('/api/admin/comments', token)

export const getAdminLikes = (token) => adminRequest('/api/admin/likes', token)

export const getAdminContactMessages = (token) =>
  adminRequest('/api/admin/contact-messages', token)

export const getAdminDownloadRequests = (token) =>
  adminRequest('/api/admin/download-requests', token)

export const getAdminProjects = (token) => adminRequest('/api/admin/projects', token)

export const getAdminVisitors = (token) => adminRequest('/api/admin/visitors', token)

export const getAdminCommunityUploads = (token) =>
  adminRequest('/api/admin/community-uploads', token)

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
        resolve(payload)
      } else {
        reject(new Error(payload.error || 'Upload failed'))
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

export const sendMessage = (payload) =>
  request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
