// Does the site actually serve what the catalogue says it serves?
//
// This module exists because of one specific failure and the way it was found.
// The fire extinguisher's 3D preview downloaded its full payload and then died
// at parse time, every time, for weeks: drei's useGLTF was fetching the Draco
// decoder from a CDN that this site's own Content-Security-Policy forbids. The
// preview sat at 86% and the only evidence was a line in a console nobody had
// open. Nothing on the site, and nothing in the admin, said a word.
//
// The lesson is not "fix that model". It is that a missing or malformed asset
// is a silent failure by default -- the catalogue row looks perfect, because
// the row is metadata and the breakage is in a file somewhere else. So this
// goes and opens the files.
//
// Three rules it follows:
//
//   1. Check what is served, not what is in the repo. Express serves the built
//      `dist` directory, so a file that exists in `public` but never made it
//      into a build is a 404 for every visitor. Resolving against `dist` is
//      what makes that visible; resolving against `public` would report a
//      green light on a broken site.
//   2. Trust magic bytes, not extensions. `studio-tomoco.exr` is named .exr,
//      is loaded as an EXR, and is not an EXR -- its first bytes are UTF-16
//      text. An extension is a claim; the header is evidence.
//   3. Every finding names the consequence a visitor sees. "Missing image" is
//      a fact; "the project card renders a broken image" is why it matters.

import { open, stat } from 'node:fs/promises'
import path from 'node:path'

// Enough bytes for every signature below plus the GLB header.
const SNIFF_BYTES = 32

const SIGNATURES = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], kind: 'png' },
  { bytes: [0xff, 0xd8, 0xff], kind: 'jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], kind: 'gif' },
  { bytes: [0x67, 0x6c, 0x54, 0x46], kind: 'glb' },
  // OpenEXR. Little-endian magic 0x76 0x2f 0x31 0x01.
  { bytes: [0x76, 0x2f, 0x31, 0x01], kind: 'exr' },
  { bytes: [0x23, 0x3f, 0x52, 0x41], kind: 'hdr' }, // "#?RA" of #?RADIANCE
  { bytes: [0x1f, 0x8b], kind: 'gzip' },
]

const IMAGE_KINDS = new Set(['png', 'jpeg', 'gif', 'webp', 'svg'])

const sniffKind = (buffer) => {
  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => buffer[index] === byte)) return signature.kind
  }

  // RIFF....WEBP -- the marker sits at offset 8, so it cannot be a prefix match.
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'webp'
  }

  const text = buffer.slice(0, 16).toString('utf8')
  if (text.trimStart().startsWith('<svg') || text.trimStart().startsWith('<?xml')) return 'svg'

  // UTF-16 text opens with a BOM or with ASCII interleaved with NULs. Worth
  // naming specifically: it is what the broken environment map turned out to
  // be, and "utf16-text" points at the real cause far better than "unknown".
  if ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)) {
    return 'utf16-text'
  }
  if (buffer[1] === 0x00 && buffer[3] === 0x00 && buffer[0] > 0x20 && buffer[2] > 0x20) {
    return 'utf16-text'
  }

  return 'unknown'
}

// Parses the JSON chunk out of a GLB. The interesting field is
// extensionsRequired: a model that *requires* KHR_draco_mesh_compression is
// undecodable without the decoder, which is the exact shape of the original
// bug.
const readGlbMetadata = async (absolutePath) => {
  const header = Buffer.alloc(20)
  const handle = await open(absolutePath, 'r')

  try {
    const { bytesRead } = await handle.read(header, 0, 20, 0)
    if (bytesRead < 20) return { error: 'file is too short to be a GLB' }
    if (header.toString('ascii', 0, 4) !== 'glTF') return { error: 'missing glTF magic' }

    const jsonLength = header.readUInt32LE(12)
    if (header.toString('ascii', 16, 20) !== 'JSON') return { error: 'first chunk is not JSON' }
    // A malformed length would otherwise ask for an arbitrary allocation.
    if (jsonLength <= 0 || jsonLength > 16 * 1024 * 1024) {
      return { error: 'JSON chunk length is implausible' }
    }

    const chunk = Buffer.alloc(jsonLength)
    await handle.read(chunk, 0, jsonLength, 20)
    const document = JSON.parse(chunk.toString('utf8'))

    return {
      extensionsRequired: document.extensionsRequired || [],
      extensionsUsed: document.extensionsUsed || [],
      generator: document.asset?.generator || '',
      images: (document.images || []).length,
      materials: (document.materials || []).length,
      meshes: (document.meshes || []).length,
      version: header.readUInt32LE(4),
    }
  } catch (error) {
    return { error: error.message }
  } finally {
    await handle.close()
  }
}

// Where a URL actually resolves. `/uploads/*` is mounted straight from
// `public/uploads` and everything else comes out of the build, so the two are
// searched in that order and the winner is reported -- "found in public but
// not in dist" is itself a finding, because only dist is served.
const resolveAsset = async (url, roots) => {
  if (!url || typeof url !== 'string' || /^https?:/i.test(url)) {
    return { external: /^https?:/i.test(url || ''), exists: false, url }
  }

  const relative = url.replace(/^\/+/, '').split('?')[0].split('#')[0]
  if (!relative || relative.includes('..')) return { exists: false, unsafe: true, url }

  for (const root of roots) {
    const absolute = path.resolve(root.dir, relative)
    // Defence in depth against a decoded path escaping its root.
    if (!absolute.startsWith(path.resolve(root.dir))) continue

    let stats
    try {
      stats = await stat(absolute)
    } catch {
      continue
    }
    if (!stats.isFile()) continue

    const buffer = Buffer.alloc(SNIFF_BYTES)
    let sniffed = Buffer.alloc(0)
    try {
      const handle = await open(absolute, 'r')
      try {
        const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
        sniffed = buffer.slice(0, bytesRead)
      } finally {
        await handle.close()
      }
    } catch {
      sniffed = Buffer.alloc(0)
    }

    return {
      absolute,
      bytes: stats.size,
      exists: true,
      kind: sniffKind(sniffed),
      root: root.name,
      url,
    }
  }

  return { exists: false, url }
}

// Only the two locales that can actually be missing.
//
// `titleEn` is NOT the English copy -- the unsuffixed `title` is, and
// pickLocalized() falls back to it for every language. So an empty `titleEn`
// is normal and means nothing, while an empty `titleZh` means a Chinese
// reader silently gets English. Treating all three suffixes alike (which the
// admin's translation chips still do) reports a gap on every project ever
// written, which is how a status panel teaches people to ignore it.
const LOCALES = [
  { label: 'Chinese', suffix: 'Zh' },
  { label: 'Japanese', suffix: 'Ja' },
]

// The three fields a visitor actually reads. Format/model-size/policy have
// sensible fallbacks; a missing summary is a blank paragraph.
const TRANSLATED_FIELDS = ['title', 'summary', 'workflow']

const describeTranslations = (project) => {
  const missing = {}

  for (const locale of LOCALES) {
    const gaps = TRANSLATED_FIELDS.filter((field) => {
      const value = project[`${field}${locale.suffix}`]

      return !value || !String(value).trim()
    })

    if (gaps.length) missing[locale.suffix] = gaps
  }

  // The base fields are the English copy and the fallback for everyone else.
  // Empty here is not a translation gap, it is missing content.
  const baseGaps = TRANSLATED_FIELDS.filter((field) => !String(project[field] || '').trim())

  return { baseGaps, complete: Object.keys(missing).length === 0 && !baseGaps.length, missing }
}

// 25 MB is not a spec limit, it is the point past which a phone with the page
// open in one tab starts evicting the texture and the preview flickers. Worth
// a warning, never a failure.
const LARGE_MODEL_BYTES = 25 * 1024 * 1024

export const createContentHealthChecker = ({ rootDir }) => {
  const distDir = path.join(rootDir, 'dist')
  const publicDir = path.join(rootDir, 'public')

  // Order matters: dist first, because dist is what is served.
  const assetRoots = [
    { dir: distDir, name: 'dist' },
    { dir: publicDir, name: 'public' },
  ]
  const uploadRoots = [
    { dir: publicDir, name: 'public' },
    { dir: distDir, name: 'dist' },
  ]

  const rootsFor = (url) => (url?.startsWith('/uploads/') ? uploadRoots : assetRoots)

  const checkDracoDecoder = async () => {
    // Both halves are needed: the wrapper is the JS entry point and the wasm is
    // the decoder itself. One without the other fails at runtime.
    const files = await Promise.all(
      ['/draco/draco_wasm_wrapper.js', '/draco/draco_decoder.wasm'].map((url) =>
        resolveAsset(url, assetRoots),
      ),
    )

    return {
      available: files.every((file) => file.exists && file.root === 'dist'),
      files,
    }
  }

  const checkProject = async (project, { draco }) => {
    const issues = []
    const image = await resolveAsset(project.image, rootsFor(project.image))
    const model = project.modelUrl
      ? await resolveAsset(project.modelUrl, rootsFor(project.modelUrl))
      : null

    if (!project.image) {
      issues.push({
        code: 'image-missing-url',
        hint: 'Set a preview image on the project.',
        message: 'The project has no preview image URL.',
        severity: 'critical',
      })
    } else if (image.external) {
      issues.push({
        code: 'image-external',
        hint: 'Host the image on this site so the CSP and the cache headers apply to it.',
        message: 'The preview image is loaded from another origin.',
        severity: 'warning',
      })
    } else if (!image.exists) {
      issues.push({
        code: 'image-missing-file',
        hint: `Nothing resolves at ${project.image}. Re-upload the image or fix the path.`,
        message: 'The preview image 404s, so the project card renders a broken image.',
        severity: 'critical',
      })
    } else {
      if (image.root !== 'dist') {
        issues.push({
          code: 'image-not-built',
          hint: 'Run npm run build and redeploy; only dist/ is served.',
          message: 'The preview image exists in public/ but is not in the build, so visitors get a 404.',
          severity: 'critical',
        })
      }
      if (!IMAGE_KINDS.has(image.kind)) {
        issues.push({
          code: 'image-wrong-format',
          hint: `The file header says "${image.kind}". Re-export it as PNG, JPEG, or WebP.`,
          message: 'The preview image is not an image file, whatever its extension claims.',
          severity: 'critical',
        })
      }
    }

    let glb = null

    if (!project.modelUrl) {
      issues.push({
        code: 'model-absent',
        hint: 'Optional. Projects without a model simply show the still image.',
        message: 'No 3D preview is attached to this project.',
        severity: 'note',
      })
    } else if (!model.exists) {
      issues.push({
        code: 'model-missing-file',
        hint: `Nothing resolves at ${project.modelUrl}. Re-upload the model or fix the path.`,
        message: 'The 3D model 404s, so the preview never opens.',
        severity: 'critical',
      })
    } else {
      if (model.root !== 'dist') {
        issues.push({
          code: 'model-not-built',
          hint: 'Run npm run build and redeploy; only dist/ is served.',
          message: 'The model exists in public/ but is not in the build, so visitors get a 404.',
          severity: 'critical',
        })
      }

      if (model.kind !== 'glb') {
        issues.push({
          code: 'model-wrong-format',
          hint: `The file header says "${model.kind}". The viewer only reads binary glTF (.glb).`,
          message: 'The model file is not a GLB, whatever its extension claims.',
          severity: 'critical',
        })
      } else {
        glb = await readGlbMetadata(model.absolute)

        if (glb.error) {
          issues.push({
            code: 'model-unreadable',
            hint: `Parsing the glTF header failed: ${glb.error}. Re-export the model.`,
            message: 'The model has a GLB header but its contents cannot be read.',
            severity: 'critical',
          })
        } else if (glb.extensionsRequired?.includes('KHR_draco_mesh_compression') && !draco.available) {
          // The round-ten bug, made into an assertion.
          issues.push({
            code: 'model-draco-no-decoder',
            hint: 'Copy three/examples/jsm/libs/draco/gltf/ into public/draco/ and rebuild.',
            message:
              'The model is Draco-compressed and the local decoder is not being served, so the preview will download in full and then fail at parse time.',
            severity: 'critical',
          })
        }

        if (model.bytes > LARGE_MODEL_BYTES) {
          issues.push({
            code: 'model-large',
            hint: 'Run scripts/optimize-model.mjs to produce a smaller variant.',
            message: `The model is ${(model.bytes / 1024 / 1024).toFixed(1)} MB, which is heavy for a phone.`,
            severity: 'warning',
          })
        }
      }
    }

    const translations = describeTranslations(project)

    if (translations.baseGaps.length) {
      issues.push({
        code: 'content-missing',
        hint: `Empty: ${translations.baseGaps.join(', ')}.`,
        message: 'Core copy is empty, so the project page renders a blank section in every language.',
        severity: 'critical',
      })
    }

    for (const [suffix, fields] of Object.entries(translations.missing)) {
      const locale = LOCALES.find((item) => item.suffix === suffix)
      issues.push({
        code: `translation-missing-${suffix}`,
        hint: `Missing: ${fields.join(', ')}.`,
        message: `${locale?.label || suffix} readers silently get the English copy on this project.`,
        severity: 'warning',
      })
    }

    if (project.isPublic === false) {
      issues.push({
        code: 'project-hidden',
        hint: 'Deliberate if you are still working on it.',
        message: 'This project is hidden from the public list.',
        severity: 'note',
      })
    }

    return {
      image,
      issues,
      isPublic: project.isPublic !== false,
      glb: glb && !glb.error ? glb : null,
      model,
      slug: project.slug,
      title: project.title,
      translations,
    }
  }

  // Files the site depends on that belong to no project. They are the easiest
  // thing in a codebase to break, because nothing imports them by name.
  const checkSiteAssets = async (draco) => {
    const environment = await resolveAsset('/assets/environments/studio-tomoco.exr', assetRoots)
    const assets = []

    assets.push({
      bytes: environment.bytes || 0,
      expected: 'exr or hdr',
      found: environment.exists ? environment.kind : 'missing',
      issue: !environment.exists
        ? {
            code: 'environment-missing',
            hint: 'The viewer falls back to unlit shading without it.',
            message: 'The studio environment map is not being served.',
            severity: 'warning',
          }
        : environment.kind !== 'exr' && environment.kind !== 'hdr'
          ? {
              code: 'environment-not-an-exr',
              hint: 'Replace it with a real HDRI export. This needs an art asset, not a code change.',
              message:
                'The studio environment map is named .exr but its header says otherwise, so image-based lighting has never worked and every preview logs an error.',
              severity: 'warning',
            }
          : null,
      label: 'Studio environment map (IBL)',
      url: '/assets/environments/studio-tomoco.exr',
    })

    assets.push({
      bytes: draco.files.reduce((total, file) => total + (file.bytes || 0), 0),
      expected: 'served from dist/draco/',
      found: draco.available ? 'present' : 'missing',
      issue: draco.available
        ? null
        : {
            code: 'draco-decoder-missing',
            hint: 'Every Draco-compressed model, including community uploads, fails without it.',
            message: 'The vendored Draco decoder is not in the build.',
            severity: 'critical',
          },
      label: 'Draco decoder (vendored, same-origin)',
      url: '/draco/',
    })

    return assets
  }

  return {
    run: async (projects) => {
      const draco = await checkDracoDecoder()
      const [checked, siteAssets] = await Promise.all([
        Promise.all(projects.map((project) => checkProject(project, { draco }))),
        checkSiteAssets(draco),
      ])

      const counts = { critical: 0, note: 0, warning: 0 }
      for (const project of checked) {
        for (const issue of project.issues) counts[issue.severity] += 1
      }
      for (const asset of siteAssets) {
        if (asset.issue) counts[asset.issue.severity] += 1
      }

      // Worst-first, so the list opens on the thing a visitor is hitting now.
      const rank = { critical: 0, warning: 1, note: 2 }
      const worstOf = (project) =>
        project.issues.reduce((worst, issue) => Math.min(worst, rank[issue.severity]), 3)

      return {
        checkedAt: new Date().toISOString(),
        counts,
        projects: checked.sort((a, b) => worstOf(a) - worstOf(b) || a.slug.localeCompare(b.slug)),
        siteAssets,
      }
    },
  }
}
