const API_BASE = import.meta.env.VITE_API_BASE || ''

const request = async (path, options) => {
  const response = await fetch(`${API_BASE}${path}`, options)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed')
  }

  return response.json()
}

export const getProfile = () => request('/api/profile')
export const getProjects = () => request('/api/projects')
export const getProject = (slug) => request(`/api/projects/${slug}`)
export const getExperience = () => request('/api/experience')

export const sendMessage = (payload) =>
  request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
