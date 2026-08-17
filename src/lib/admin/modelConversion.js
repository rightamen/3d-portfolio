// Browser-side FBX/OBJ -> GLB conversion for the Projects uploader.
//
// The whole point is that nobody has to install a toolchain to publish a
// model: the admin picks the source files (plus the .mtl and its textures for
// OBJ), three.js parses them here, and only the finished GLB is uploaded.
// three.js itself is imported dynamically so the admin bundle stays small for
// the sections that never touch a model.

import { getExtension, getFileExtension } from './format'

const modelFileExtensions = new Set(['.glb', '.gltf', '.fbx', '.obj'])
const materialFileExtensions = new Set(['.mtl'])
const textureFileExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const mtlTextureReferenceExtensions = new Set([
  ...textureFileExtensions,
  '.bmp',
  '.psd',
  '.tga',
  '.tif',
  '.tiff',
])

const normalizeAssetName = (value) =>
  decodeURIComponent(String(value || ''))
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase()

const getAssetBasename = (value) => normalizeAssetName(value).split('/').pop()

const getAssetStem = (value) => getAssetBasename(value).replace(/\.[^.]+$/, '')

const createLocalAssetManager = (files) => {
  const objectUrls = []
  const urlByName = new Map()
  const textureAssets = []

  files.forEach((file) => {
    const url = URL.createObjectURL(file)
    const filePath = file.webkitRelativePath || file.name
    const extension = getFileExtension(file.name)
    const basename = getAssetBasename(file.name)

    objectUrls.push(url)
    urlByName.set(normalizeAssetName(filePath), url)
    urlByName.set(normalizeAssetName(file.name), url)
    urlByName.set(basename, url)

    if (textureFileExtensions.has(extension)) {
      textureAssets.push({
        basename,
        stem: getAssetStem(file.name),
        url,
      })
    }
  })

  const findTextureFallback = (assetUrl) => {
    if (!mtlTextureReferenceExtensions.has(getFileExtension(assetUrl))) return null

    const requestedStem = getAssetStem(assetUrl)
    const directMatch = textureAssets.find(
      (asset) => asset.stem === requestedStem || asset.stem.startsWith(`${requestedStem}_`),
    )
    if (directMatch) return directMatch

    const looseMatch = textureAssets.find(
      (asset) => requestedStem.includes(asset.stem) || asset.stem.includes(requestedStem),
    )
    if (looseMatch) return looseMatch

    return textureAssets.length === 1 ? textureAssets[0] : null
  }

  return {
    resolveTextureReference(url) {
      const normalized = normalizeAssetName(url)
      const basename = getAssetBasename(url)
      const exactUrl = urlByName.get(normalized) || urlByName.get(basename)

      if (exactUrl) {
        return { basename, replaced: false, url: exactUrl }
      }

      const fallback = findTextureFallback(url)
      if (!fallback) return null

      return { ...fallback, replaced: true }
    },
    resolve(url) {
      return this.resolveTextureReference(url)?.url || url
    },
    has(url) {
      return Boolean(this.resolveTextureReference(url))
    },
    revoke() {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    },
  }
}

const getMtlTextureReferences = (mtlText) =>
  mtlText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(map_|bump|disp|decal|refl)\S*\s+/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+/)
      const candidates = []

      for (let index = 1; index < parts.length; index += 1) {
        const candidate = parts.slice(index).join(' ')
        if (mtlTextureReferenceExtensions.has(getFileExtension(candidate))) {
          candidates.push(candidate)
        }
      }

      return candidates
    })
    .filter((candidates) => candidates.length > 0)

const assertSelectedMtlTextures = (mtlText, assetManager) => {
  const missing = getMtlTextureReferences(mtlText)
    .filter((candidates) => !candidates.some((textureName) => assetManager.has(textureName)))
    .map((candidates) => candidates.at(-1))

  if (missing.length > 0) {
    throw new Error(`Missing texture files: ${missing.slice(0, 3).join(', ')}`)
  }
}

const rewriteMtlTextureReferences = (mtlText, assetManager) =>
  mtlText
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\s*(map_|bump|disp|decal|refl)\S*\s+/i.test(line)) return line

      const trimmed = line.trim()
      const parts = trimmed.split(/\s+/)

      for (let index = 1; index < parts.length; index += 1) {
        const candidate = parts.slice(index).join(' ')
        if (!mtlTextureReferenceExtensions.has(getFileExtension(candidate))) continue

        const resolved = assetManager.resolveTextureReference(candidate)
        if (!resolved?.replaced) return line

        return line.replace(candidate, resolved.basename)
      }

      return line
    })
    .join('\n')

const exportGlb = (object, GLTFExporter) =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result)
          return
        }

        reject(new Error('GLB exporter returned JSON instead of binary data.'))
      },
      (error) => reject(error),
      {
        binary: true,
        embedImages: true,
        forceIndices: true,
        truncateDrawRange: true,
      },
    )
  })

const createLoadingManagerWaiter = (loadingManager) => {
  let finish
  const promise = new Promise((resolve, reject) => {
    let settled = false

    finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    loadingManager.onLoad = finish
    loadingManager.onError = (url) => {
      if (settled) return
      settled = true
      reject(new Error(`Texture failed to load: ${getAssetBasename(url) || url}`))
    }
  })

  return () => {
    if (loadingManager.itemsTotal === loadingManager.itemsLoaded) finish()
    return promise
  }
}

const waitForTextureImage = (texture, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now()

    const check = () => {
      const image = texture?.image
      if (image) {
        resolve(image)
        return
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error('Texture image was not loaded before GLB export.'))
        return
      }

      requestAnimationFrame(check)
    }

    check()
  })

const waitForTexture = async (texture) => {
  const image = await waitForTextureImage(texture)

  if (image.complete || image.width > 0 || image.data) {
    if (image.decode) {
      await image.decode().catch(() => {})
    }
    return
  }

  if (!image.addEventListener) return

  await new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true })
    image.addEventListener('error', () => reject(new Error('A texture image failed to load.')), {
      once: true,
    })
  })

  if (image.decode) {
    await image.decode().catch(() => {})
  }
}

const normalizeTextureForGlbExport = (texture) => {
  const image = texture?.image
  if (!image || image.data || image instanceof HTMLCanvasElement) {
    return
  }

  const width = image.naturalWidth || image.videoWidth || image.width
  const height = image.naturalHeight || image.videoHeight || image.height

  if (!width || !height) {
    throw new Error('Texture image loaded without readable dimensions.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to prepare texture canvas for GLB export.')
  }

  try {
    context.drawImage(image, 0, 0, width, height)
  } catch {
    throw new Error('Unable to read selected texture image for GLB export.')
  }

  texture.image = canvas
  if (texture.source) {
    texture.source.data = canvas
  }
  texture.needsUpdate = true
}

const collectObjectTextures = (object) => {
  const textures = new Set()
  const textureKeys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'alphaMap',
    'emissiveMap',
    'bumpMap',
    'specularMap',
  ]

  object.traverse((item) => {
    const materials = Array.isArray(item.material) ? item.material : [item.material]
    materials.filter(Boolean).forEach((material) => {
      textureKeys.forEach((key) => {
        if (material[key]) textures.add(material[key])
      })
    })
  })

  return textures
}

const waitForObjectTextures = async (object) => {
  const textures = collectObjectTextures(object)

  await Promise.all(Array.from(textures).map(waitForTexture))
  textures.forEach(normalizeTextureForGlbExport)
  return textures.size
}

export const findPrimaryModelFile = (files) =>
  files.find((file) => ['.fbx', '.obj'].includes(getFileExtension(file.name))) ||
  files.find((file) => modelFileExtensions.has(getFileExtension(file.name))) ||
  files[0]

export const convertModelInBrowser = async (files) => {
  const fileList = Array.isArray(files) ? files : [files]
  const file = findPrimaryModelFile(fileList)
  const extension = getFileExtension(file.name)
  if (!['.fbx', '.obj'].includes(extension)) {
    return {
      converted: false,
      file,
      originalExtension: getExtension(file.name),
    }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const [{ GLTFExporter }, { FBXLoader }, { OBJLoader }, { MTLLoader }, { LoadingManager }] =
    await Promise.all([
    import('three/examples/jsm/exporters/GLTFExporter.js'),
    import('three/examples/jsm/loaders/FBXLoader.js'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
    import('three/examples/jsm/loaders/MTLLoader.js'),
    import('three'),
  ])
  const assetManager = createLocalAssetManager(fileList)
  const loadingManager = new LoadingManager()
  loadingManager.setURLModifier((url) => assetManager.resolve(url))
  const waitForAssetLoads = createLoadingManagerWaiter(loadingManager)

  let object
  try {
    if (extension === '.fbx') {
      object = new FBXLoader(loadingManager).parse(await file.arrayBuffer(), '')
    } else {
      const objLoader = new OBJLoader(loadingManager)
      const materialFile = fileList.find((item) => materialFileExtensions.has(getFileExtension(item.name)))

      if (materialFile) {
        const mtlText = await materialFile.text()
        const rewrittenMtlText = rewriteMtlTextureReferences(mtlText, assetManager)
        assertSelectedMtlTextures(rewrittenMtlText, assetManager)
        const materials = new MTLLoader(loadingManager).parse(rewrittenMtlText, '')
        materials.preload()
        objLoader.setMaterials(materials)
      }

      object = objLoader.parse(await file.text())
    }

    await waitForAssetLoads()
    const embeddedTextureCount = await waitForObjectTextures(object)
    const glbBuffer = await exportGlb(object, GLTFExporter)

    return {
      converted: true,
      file: new File([glbBuffer], `${baseName}.glb`, { type: 'model/gltf-binary' }),
      originalExtension: getExtension(file.name),
      textureCount: Math.max(
        embeddedTextureCount,
        fileList.filter((item) => textureFileExtensions.has(getFileExtension(item.name))).length,
      ),
    }
  } finally {
    assetManager.revoke()
  }
}
