import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import multer from 'multer'
import { messageInput } from './communicationValidation.js'
import { hasValidFileHeader } from './fileSignatures.js'
import { messageMediaLimits, messageMediaTypes } from './messageMediaLimits.js'
import { describeUploadError } from './responses.js'
import { socialFail } from './socialValidation.js'

const parseMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: messageMediaLimits.video + 1, files: 1, fields: 1, fieldSize: 16_000, parts: 3 },
}).single('file')

const mediaName = (name, extension) => {
  let decoded = name
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'))
  } catch {
    // Older clients can send a Latin-1 filename.
  }
  const base = decoded.slice(0, -extension.length).replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu, '')
    .replace(/[/\\]/g, '').trim()
  return (Array.from(base).slice(0, 110).join('') || 'attachment') + extension
}

export const registerMessageMediaRoutes = ({ route, store, sendData, sendError, codes }) => {
  const messagePath = '/api/account/messages/threads/:id/messages'
  // Both multipart parsing and binary responses can hold a full attachment.
  // Bound their concurrent memory use in the web process.
  let activeTransfers = 0
  const transfer = async (res, send) => {
    if (activeTransfers >= 6) socialFail('Too many active attachment transfers.',429)
    activeTransfers += 1
    let active = true
    const release = () => {
      if (!active) return
      active = false
      activeTransfers -= 1
    }
    res.once('finish', release)
    res.once('close', release)
    try {
      return await send()
    } catch (error) {
      release()
      throw error
    }
  }

  route('post', messagePath + '/media', async (req, res) => {
    const userId = req.visitorUser.id
    const { clientId } = messageInput({ clientId: req.query.clientId }, { attachment: true })
    await store.requireMediaSend(userId, req.params.id, clientId)

    return transfer(res, async () => {
      try {
        await new Promise((resolve, reject) => parseMedia(req, res, (error) => error ? reject(error) : resolve()))
      } catch (error) {
        const issue = describeUploadError(error)
        if (issue) return sendError(res, issue.code, issue.message, issue.httpStatus)
        throw error
      }

      const file = req.file
      const extension = extname(file?.originalname ?? '').toLowerCase()
      const type = Object.hasOwn(messageMediaTypes, extension) && messageMediaTypes[extension]
      if (!file || !type || !hasValidFileHeader(file.buffer.subarray(0, 64), extension)) {
        return sendError(res, codes.INVALID_FILE_TYPE, 'Choose a supported image or video.', 400)
      }
      if (file.size > messageMediaLimits[type.kind]) {
        return sendError(res, codes.FILE_TOO_LARGE, 'Attachment is too large.', 413)
      }
      const input = messageInput({ body: req.body?.body, clientId }, { attachment: true })
      const media = {
        bytes: file.buffer,
        metadata: {
          ...type,
          name: mediaName(file.originalname, extension),
          size: file.size,
          digest: createHash('sha256').update(file.buffer).digest('hex'),
        },
      }
      const message = await store.sendMessage(userId, req.params.id, input, media)
      return sendData(res, { message })
    })
  })

  route('get', messagePath + '/:messageId/media', (req, res) => transfer(res, async () => {
    const result = await store.getMessageMedia(req.visitorUser.id, req.params.id, req.params.messageId)
    res.attachment(result.attachment.name)
    return res.type(result.attachment.mimeType).send(result.bytes)
  }))
}
