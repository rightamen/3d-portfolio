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

export const getProfile = () => request('/api/profile')
export const getProjects = () => request('/api/projects')
export const getProject = (slug) => request(`/api/projects/${slug}`)
export const getProjectInteractions = (slug) =>
  request(`/api/projects/${slug}/interactions`)
export const getExperience = () => request('/api/experience')

export const toggleProjectLike = (slug, visitorId) =>
  request(`/api/projects/${slug}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId }),
  })

export const addProjectComment = (slug, payload) =>
  request(`/api/projects/${slug}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const requestProjectDownload = (slug, payload) =>
  request(`/api/projects/${slug}/download-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getAdminSummary = (token) => adminRequest('/api/admin/summary', token)

export const getAdminComments = (token) => adminRequest('/api/admin/comments', token)

export const getAdminContactMessages = (token) =>
  adminRequest('/api/admin/contact-messages', token)

export const getAdminDownloadRequests = (token) =>
  adminRequest('/api/admin/download-requests', token)

export const updateAdminDownloadRequest = (token, id, status) =>
  adminRequest(`/api/admin/download-requests/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

export const sendMessage = (payload) =>
  request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
