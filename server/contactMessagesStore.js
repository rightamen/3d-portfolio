import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const createContactMessagesStore = (dataDir) => {
  const filePath = path.join(dataDir, 'messages.jsonl')

  const addMessage = async (message) => {
    await mkdir(dataDir, { recursive: true })

    const normalized = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...message,
      createdAt: new Date().toISOString(),
    }

    await appendFile(filePath, `${JSON.stringify(normalized)}\n`, 'utf8')
    return normalized
  }

  return {
    addMessage,
  }
}
