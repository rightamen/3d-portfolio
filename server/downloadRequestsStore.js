import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const createDownloadRequestsStore = (dataDir) => {
  const filePath = path.join(dataDir, 'download-requests.jsonl')

  const addRequest = async (request) => {
    await mkdir(dataDir, { recursive: true })

    const normalized = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'pending',
      ...request,
      createdAt: new Date().toISOString(),
    }

    await appendFile(filePath, `${JSON.stringify(normalized)}\n`, 'utf8')
    return normalized
  }

  return {
    addRequest,
  }
}
