import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const emptyProjectState = () => ({
  likes: [],
  comments: [],
})

const sanitizeProjectState = (state) => ({
  likes: Array.isArray(state?.likes) ? state.likes.filter(Boolean) : [],
  comments: Array.isArray(state?.comments)
    ? state.comments
        .filter((comment) => comment?.id && comment?.author && comment?.message)
        .slice(-100)
    : [],
})

export const createInteractionsStore = (dataDir) => {
  const filePath = path.join(dataDir, 'project-interactions.json')
  let writeQueue = Promise.resolve()

  const readAll = async () => {
    try {
      const raw = await readFile(filePath, 'utf8')
      return JSON.parse(raw)
    } catch (error) {
      if (error.code === 'ENOENT') return {}
      throw error
    }
  }

  const writeAll = async (data) => {
    await mkdir(dataDir, { recursive: true })
    const tempPath = `${filePath}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
    await rename(tempPath, filePath)
  }

  const mutate = async (handler) => {
    writeQueue = writeQueue.then(async () => {
      const data = await readAll()
      const result = await handler(data)
      await writeAll(data)
      return result
    })

    return writeQueue
  }

  const getProjectState = async (slug) => {
    const data = await readAll()
    return sanitizeProjectState(data[slug] || emptyProjectState())
  }

  const toggleLike = async (slug, visitorId) =>
    mutate((data) => {
      const state = sanitizeProjectState(data[slug] || emptyProjectState())
      const hasLiked = state.likes.includes(visitorId)
      state.likes = hasLiked
        ? state.likes.filter((id) => id !== visitorId)
        : [...state.likes, visitorId]
      data[slug] = state
      return {
        liked: !hasLiked,
        likeCount: state.likes.length,
      }
    })

  const addComment = async (slug, comment) =>
    mutate((data) => {
      const state = sanitizeProjectState(data[slug] || emptyProjectState())
      const normalized = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: comment.author,
        message: comment.message,
        createdAt: new Date().toISOString(),
      }
      state.comments = [...state.comments, normalized].slice(-100)
      data[slug] = state
      return normalized
    })

  return {
    addComment,
    getProjectState,
    toggleLike,
  }
}
