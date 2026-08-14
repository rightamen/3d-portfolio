// Pins server/contentHealth.js against a fixture tree of deliberately broken
// assets.
//
// The checker exists to catch silent failures, so the only way to trust it is
// to hand it each failure on purpose and confirm it says so. A checker that
// has never seen a broken file is indistinguishable from one that returns
// "everything is fine" unconditionally -- and this project has already been
// burned once by a green light over a preview that never loaded.
//
// Every fixture below is written into a temp directory shaped like a build
// (dist/ and public/), so nothing here touches the real catalogue.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createContentHealthChecker } from '../server/contentHealth.js'

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'content-health-'))
const dist = path.join(sandbox, 'dist')
const publicDir = path.join(sandbox, 'public')

for (const dir of [
  path.join(dist, 'assets', 'projects'),
  path.join(dist, 'assets', 'environments'),
  path.join(dist, 'models'),
  path.join(dist, 'draco'),
  path.join(publicDir, 'assets', 'projects'),
  path.join(publicDir, 'models'),
  path.join(publicDir, 'uploads', 'images'),
  path.join(publicDir, 'uploads', 'models'),
  path.join(dist, 'uploads', 'images'),
]) {
  mkdirSync(dir, { recursive: true })
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const EXR = Buffer.from([0x76, 0x2f, 0x31, 0x01, 0, 0, 0, 0])

// A minimal but structurally real GLB: header, then a JSON chunk.
const buildGlb = (document) => {
  const json = Buffer.from(JSON.stringify(document), 'utf8')
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const header = Buffer.alloc(20)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + padded.length, 8)
  header.writeUInt32LE(padded.length, 12)
  header.write('JSON', 16, 'ascii')

  return Buffer.concat([header, padded])
}

const plainGlb = buildGlb({ asset: { version: '2.0' }, meshes: [{}], materials: [{}] })
const dracoGlb = buildGlb({
  asset: { version: '2.0' },
  extensionsRequired: ['KHR_draco_mesh_compression'],
  extensionsUsed: ['KHR_draco_mesh_compression'],
  meshes: [{}],
})

writeFileSync(path.join(dist, 'assets', 'projects', 'good.png'), PNG)
writeFileSync(path.join(dist, 'assets', 'environments', 'studio-tomoco.exr'), EXR)
writeFileSync(path.join(dist, 'models', 'good.glb'), plainGlb)
writeFileSync(path.join(dist, 'models', 'draco.glb'), dracoGlb)
// Named .glb, actually a PNG. The whole point of sniffing headers.
writeFileSync(path.join(dist, 'models', 'liar.glb'), PNG)
// Present in public/, never built. Served: no.
writeFileSync(path.join(publicDir, 'assets', 'projects', 'unbuilt.png'), PNG)
// Present in BOTH, with different contents. dist/ is what express serves, so
// the checker must read that one -- otherwise a stale public/ copy silently
// vouches for a broken build. The two differ by format so the assertion can
// tell which one was opened.
writeFileSync(path.join(dist, 'assets', 'projects', 'both.png'), PNG)
writeFileSync(
  path.join(publicDir, 'assets', 'projects', 'both.png'),
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
)
// Uploads. These are served from public/uploads, NOT from the build -- the
// mount is registered before the dist static handler. Asserting "must be in
// dist" for these reported seven criticals against a live site whose assets
// all return 200, which is the exact failure mode a checker must not have.
writeFileSync(path.join(publicDir, 'uploads', 'images', 'shot.png'), PNG)
writeFileSync(path.join(publicDir, 'uploads', 'models', 'piece.glb'), plainGlb)
// The mirror case: an upload that only exists inside a build. A redeploy
// replaces dist/, so this one really is about to disappear.
writeFileSync(path.join(dist, 'uploads', 'images', 'stale.png'), PNG)

writeFileSync(path.join(dist, 'draco', 'draco_wasm_wrapper.js'), Buffer.from('//'))
writeFileSync(path.join(dist, 'draco', 'draco_decoder.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]))

const complete = {
  summary: 'A summary.',
  summaryJa: 'まとめ',
  summaryZh: '摘要',
  title: 'A title',
  titleJa: 'タイトル',
  titleZh: '标题',
  workflow: 'A workflow.',
  workflowJa: 'ワークフロー',
  workflowZh: '流程',
}

const projects = [
  { ...complete, image: '/assets/projects/good.png', modelUrl: '/models/good.glb', slug: 'clean' },
  { ...complete, image: '/assets/projects/good.png', modelUrl: '/models/draco.glb', slug: 'draco' },
  { ...complete, image: '/assets/projects/good.png', modelUrl: '/models/gone.glb', slug: 'model-404' },
  { ...complete, image: '/assets/projects/good.png', modelUrl: '/models/liar.glb', slug: 'model-liar' },
  { ...complete, image: '/assets/projects/gone.png', slug: 'image-404' },
  { ...complete, image: '/assets/projects/unbuilt.png', slug: 'image-unbuilt' },
  { ...complete, image: '/assets/projects/both.png', slug: 'image-both' },
  {
    ...complete,
    image: '/uploads/images/shot.png',
    modelUrl: '/uploads/models/piece.glb',
    slug: 'uploaded',
  },
  { ...complete, image: '/uploads/images/stale.png', slug: 'upload-only-in-dist' },
  // English base copy missing entirely: not a translation gap, missing content.
  { ...complete, image: '/assets/projects/good.png', slug: 'no-copy', summary: '', title: '' },
  // No Zh/Ja. English is the unsuffixed field, so this is exactly two gaps.
  {
    image: '/assets/projects/good.png',
    slug: 'english-only',
    summary: 'A summary.',
    title: 'A title',
    workflow: 'A workflow.',
  },
]

const checker = createContentHealthChecker({ rootDir: sandbox })
const health = await checker.run(projects)
const bySlug = new Map(health.projects.map((project) => [project.slug, project]))
const codesFor = (slug) => (bySlug.get(slug)?.issues || []).map((issue) => issue.code)

// 1. A well-formed project raises nothing.
check(codesFor('clean').length === 0, `clean project reported ${codesFor('clean').join(', ')}`)

// 2. Draco is fine while the decoder is served -- this must NOT be a finding,
//    or the one real fix the site already shipped would read as a failure.
check(codesFor('draco').length === 0, `draco project reported ${codesFor('draco').join(', ')}`)

// 3. The failures the checker exists for.
check(codesFor('model-404').includes('model-missing-file'), 'a missing model was not reported')
check(codesFor('model-liar').includes('model-wrong-format'), 'a PNG named .glb was not reported')
check(codesFor('image-404').includes('image-missing-file'), 'a missing image was not reported')
check(
  codesFor('image-unbuilt').includes('image-not-built'),
  'an asset present only in public/ was not reported as unbuilt',
)

// dist/ wins when both copies exist. Asserted on the sniffed kind rather than
// on `root` alone, so the check fails if the wrong file was opened even when
// the reported root happens to look right.
const both = bySlug.get('image-both')
check(both?.image.root === 'dist', `an asset in both roots resolved to ${both?.image.root}`)
check(both?.image.kind === 'png', `the public/ copy was read instead of dist/ (got ${both?.image.kind})`)
check(
  !codesFor('image-both').some((code) => code.startsWith('image-')),
  `image-both reported ${codesFor('image-both').join(', ')}`,
)

// Uploads are served from public/uploads and must NOT be asked to be in dist.
// This is the regression that shipped once: seven criticals on a healthy site.
const uploaded = bySlug.get('uploaded')
check(uploaded?.image.root === 'public', `an upload resolved to ${uploaded?.image.root}`)
check(
  !codesFor('uploaded').some((code) => code.endsWith('-not-built')),
  `an upload was wrongly reported as unbuilt: ${codesFor('uploaded').join(', ')}`,
)
check(
  codesFor('uploaded').every((code) => code === 'project-hidden'),
  `a healthy uploaded project reported ${codesFor('uploaded').join(', ')}`,
)

// The mirror: an upload that exists only inside the build is genuinely wrong,
// because the next deploy replaces dist/.
check(
  codesFor('upload-only-in-dist').includes('image-not-in-upload-store'),
  'an upload present only in dist/ was not reported',
)

// 4. Locale accounting. English lives in the unsuffixed field.
check(
  codesFor('no-copy').includes('content-missing'),
  'empty base copy was not reported as missing content',
)
check(
  !codesFor('english-only').includes('translation-missing-En'),
  'a project with full English copy was wrongly reported as missing English',
)
check(
  codesFor('english-only').includes('translation-missing-Zh') &&
    codesFor('english-only').includes('translation-missing-Ja'),
  'missing Chinese/Japanese copy was not reported',
)

// 5. The environment map is a real EXR in this fixture, so it must pass. The
//    live one does not, which is the finding this check would otherwise mask.
const environment = health.siteAssets.find((asset) => asset.url.includes('environments'))
check(environment?.found === 'exr', `a real EXR was sniffed as "${environment?.found}"`)
check(!environment?.issue, 'a valid environment map was reported as a problem')

// 6. Severity accounting drives the badge, so it has to add up.
const counted = health.projects.reduce((total, project) => total + project.issues.length, 0)
const totals = health.counts.critical + health.counts.warning + health.counts.note
const assetIssues = health.siteAssets.filter((asset) => asset.issue).length
check(totals === counted + assetIssues, `counts (${totals}) disagree with issues (${counted + assetIssues})`)

// 7. Worst-first ordering: nothing clean may sort above something critical.
const firstClean = health.projects.findIndex((project) => project.issues.length === 0)
const lastCritical = health.projects.reduce(
  (last, project, index) =>
    project.issues.some((issue) => issue.severity === 'critical') ? index : last,
  -1,
)
check(
  firstClean === -1 || lastCritical < firstClean,
  'a project with no issues sorted above one with a critical issue',
)

// 8. Path traversal must not resolve, whatever the catalogue says.
const escaped = await checker.run([{ ...complete, image: '/../../../etc/passwd', slug: 'escape' }])
check(
  escaped.projects[0].issues.some((issue) => issue.code === 'image-missing-file'),
  'a traversal path was not refused',
)
check(escaped.projects[0].image.exists === false, 'a traversal path resolved to a real file')

// 9. The original bug, reproduced. With the decoder gone, a Draco-requiring
//    model must be called out -- and a plain GLB next to it must not be. This
//    needs its own run: the fixture above always serves the decoder, so the
//    branch is never exercised there, and a version of the checker with the
//    Draco assertion deleted passed every assertion up to this point.
rmSync(path.join(dist, 'draco'), { force: true, recursive: true })
const withoutDecoder = await checker.run(projects)
const decoderless = new Map(withoutDecoder.projects.map((project) => [project.slug, project]))
const decoderlessCodes = (slug) =>
  (decoderless.get(slug)?.issues || []).map((issue) => issue.code)

check(
  decoderlessCodes('draco').includes('model-draco-no-decoder'),
  'a Draco model with no decoder served was not reported',
)
check(
  !decoderlessCodes('clean').includes('model-draco-no-decoder'),
  'a plain GLB was blamed for the missing Draco decoder',
)
check(
  withoutDecoder.siteAssets.some((asset) => asset.issue?.code === 'draco-decoder-missing'),
  'the missing Draco decoder was not reported as a site asset problem',
)

rmSync(sandbox, { force: true, recursive: true })

if (failures.length) {
  console.error('[content-health] FAILED')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[content-health] all checks passed')
