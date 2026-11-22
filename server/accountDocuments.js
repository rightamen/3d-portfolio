import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { hasValidFileSignature } from './fileSignatures.js'
import { API_ERROR_CODES, sendData, sendError } from './responses.js'
import { createUploadStorage } from './uploadStorage.js'

const limit = 50 * 1024 * 1024
const kinds = new Set(['resume', 'portfolio'])

const directoryFor = (dataDir, userId) =>
  path.join(dataDir, 'account-documents', createHash('sha256').update(userId).digest('hex'))

const removeFile = async (filePath) => {
  try {
    await unlink(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not remove an account document:', error.code)
  }
}

export const removeAccountDocuments = async (dataDir, userId) => {
  try {
    await rm(directoryFor(dataDir, userId), { force: true, recursive: true })
  } catch (error) {
    console.error('Could not remove account documents:', error.code)
  }
}

const displayName = (originalName) => {
  // Browsers send UTF-8 filename parameters, which Multer reads as Latin-1.
  let decoded = originalName
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(originalName, 'latin1'))
  } catch {
    // A legacy client may have sent Latin-1.
  }
  const base = decoded.slice(0, -4).replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu, '')
    .replace(/[/\\]/g, '').trim()
  return (Array.from(base).slice(0, 116).join('') || 'document') + '.pdf'
}

const metadata = (row) => ({
  kind: row.kind,
  fileName: row.file_name,
  byteSize: row.byte_size,
  updatedAt: row.updated_at,
})

const requireKind = (request, response, next) => {
  if (kinds.has(request.params.kind)) return next()
  return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Unknown document type.', 400)
}

const documentMissing = (response) =>
  sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'Document not found.', 404)

export const createAccountDocumentsRouter = ({ dataDir, store, requireVisitor, writeLimiter }) => {
  const router = Router()
  const upload = multer({
    limits: { fileSize: limit + 1, files: 1, fields: 0 },
    storage: createUploadStorage({
      destination(request, _file, done) {
        const directory = directoryFor(dataDir, request.visitorUser.id)
        mkdir(directory, { mode: 0o700, recursive: true }).then(() => done(null, directory), done)
      },
      filename(_request, _file, done) {
        done(null, randomUUID() + '.pdf')
      },
    }),
    fileFilter(_request, file, done) {
      if (path.extname(file.originalname).toLowerCase() === '.pdf') return done(null, true)
      return done(Object.assign(new Error('Only PDF documents are accepted.'), { code: 'INVALID_FILE_TYPE' }))
    },
  })

  router.use(requireVisitor, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store')
    next()
  })

  router.get('/', async (request, response) =>
    sendData(response, { documents: (await store.list(request.visitorUser.id)).map(metadata) }),
  )

  router.post('/:kind', requireKind, writeLimiter, upload.single('file'), async (request, response) => {
    const { file, params: { kind }, visitorUser: { id } } = request
    if (!file) return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'A PDF file is required.', 400)
    if (file.size > limit) {
      await removeFile(file.path)
      return sendError(response, API_ERROR_CODES.FILE_TOO_LARGE, 'The PDF limit is 50 MB.', 413)
    }
    if (!(await hasValidFileSignature(file.path, '.pdf'))) {
      await removeFile(file.path)
      return sendError(response, API_ERROR_CODES.INVALID_FILE_TYPE, 'The file is not a PDF.', 400)
    }

    let result
    try {
      result = await store.replace(id, kind, {
        storedName: file.filename,
        fileName: displayName(file.originalname),
        byteSize: file.size,
      })
    } catch (error) {
      // If the connection dropped at COMMIT, the document may already be live.
      const current = await store.get(id, kind).catch(() => undefined)
      if (current !== undefined && current?.stored_name !== file.filename) await removeFile(file.path)
      throw error
    }

    if (!result) {
      await removeFile(file.path)
      return sendError(response, API_ERROR_CODES.AUTH_REQUIRED, 'Please sign in to continue.', 401)
    }
    if (result.previousName) await removeFile(path.join(file.destination, result.previousName))
    return sendData(response, { document: metadata(result.document) }, 201)
  })

  router.get('/:kind/download', requireKind, async (request, response, next) => {
    const userId = request.visitorUser.id
    const row = await store.get(userId, request.params.kind)
    if (!row) return documentMissing(response)

    response.attachment(row.file_name)
    response.set('Content-Type', 'application/octet-stream')
    return response.sendFile(row.stored_name, {
      root: directoryFor(dataDir, userId),
      cacheControl: false,
      lastModified: false,
      acceptRanges: false,
    }, (error) => {
      if (!error) return
      if (!response.headersSent && error.code === 'ENOENT') {
        response.removeHeader('Content-Disposition')
        return documentMissing(response)
      }
      return next(error)
    })
  })

  router.delete('/:kind', requireKind, writeLimiter, async (request, response) => {
    const userId = request.visitorUser.id
    const previousName = await store.remove(userId, request.params.kind)
    if (previousName) await removeFile(path.join(directoryFor(dataDir, userId), previousName))
    return sendData(response, { ok: true })
  })

  return router
}
