import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const convertibleExtensions = new Set(['.fbx', '.obj'])

const commandExists = async (command) => {
  try {
    await execFileAsync(command, ['--version'], { timeout: 8_000 })
    return true
  } catch {
    return false
  }
}

const findBlender = async () => {
  const candidates = [process.env.BLENDER_BIN, 'blender'].filter(Boolean)

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      try {
        await access(candidate)
        return candidate
      } catch {
        continue
      }
    }

    if (await commandExists(candidate)) return candidate
  }

  return null
}

export const convertModelToGlb = async ({ inputPath, outputPath, scriptPath }) => {
  const extension = path.extname(inputPath).toLowerCase()

  if (!convertibleExtensions.has(extension)) {
    return {
      status: extension === '.glb' || extension === '.gltf' ? 'not-needed' : 'unsupported',
      message:
        extension === '.glb' || extension === '.gltf'
          ? 'Model is already web-ready.'
          : 'This model format cannot be converted automatically yet.',
    }
  }

  const blender = await findBlender()

  if (!blender) {
    return {
      status: 'skipped',
      message: 'Blender is not installed on the server, so automatic GLB conversion was skipped.',
    }
  }

  try {
    await execFileAsync(
      blender,
      ['--background', '--factory-startup', '--python', scriptPath, '--', '--input', inputPath, '--out', outputPath],
      {
        maxBuffer: 1024 * 1024 * 8,
        timeout: Number(process.env.MODEL_CONVERT_TIMEOUT_MS || 180_000),
      },
    )

    return {
      status: 'converted',
      message: 'Model converted to GLB.',
    }
  } catch (error) {
    return {
      status: 'failed',
      message: error.stderr?.trim() || error.message || 'Model conversion failed.',
    }
  }
}
