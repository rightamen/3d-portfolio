export const messageMediaTypes = {
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.webp': { kind: 'image', mimeType: 'image/webp' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
}

const mebibyte = 1024 ** 2
export const messageMediaLimits = { image: 10 * mebibyte, video: 25 * mebibyte }
export const messageMediaQuota = 250 * mebibyte
