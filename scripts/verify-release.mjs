import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { assertPushedRelease, createTraceableRelease } from './lib/create-release.mjs'
import { buildRemoteScript } from './lib/deploy-remote-script.mjs'
import { PRUNE_FUNCTION } from './lib/deploy-backup-script.mjs'

const exec = promisify(execFile)
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'traceable-release-'))
const rootDir = path.join(sandbox, 'source')
const git = (...args) => exec('git', args, { cwd: rootDir })
let passed = 0
const check = async (name, fn) => { await fn(); passed++; console.log('ok - ' + name) }
try {
  await mkdir(rootDir)
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'Release Fixture')
  await git('config', 'user.email', 'fixture@example.invalid')
  for (const name of ['server', 'scripts', 'public/uploads']) await mkdir(path.join(rootDir, name), { recursive: true })
  await writeFile(path.join(rootDir, '.gitignore'), 'dist/\n.deploy-tools/\npublic/uploads/\n.env\n')
  await writeFile(path.join(rootDir, 'server/index.js'), '// fixture\n')
  await writeFile(path.join(rootDir, 'scripts/index.js'), '// fixture\n')
  await writeFile(path.join(rootDir, 'public/uploads/private.txt'), 'do not ship')
  await writeFile(path.join(rootDir, '.env'), 'PRIVATE_FIXTURE=do-not-ship\n')
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({ scripts: { build: 'node build.mjs' } }))
  await writeFile(path.join(rootDir, 'package-lock.json'), '{}')
  await writeFile(path.join(rootDir, 'build.mjs'), [
    "import { mkdirSync, writeFileSync } from 'node:fs'",
    "import { execFileSync } from 'node:child_process'",
    "mkdirSync('dist', {recursive:true}); writeFileSync('dist/index.html','fresh build')",
    "if (process.env.RELEASE_TEST_MODE === 'uploads') mkdirSync('dist/uploads', {recursive:true})",
    "if (process.env.RELEASE_TEST_MODE === 'dirty') writeFileSync('server/index.js','changed while building')",
    "if (process.env.RELEASE_TEST_MODE === 'commit') execFileSync('git',['commit','--allow-empty','-m','changed while building'])",
  ].join('\n'))
  await git('add', '.')
  await git('commit', '-m', 'fixture')
  await mkdir(path.join(rootDir, 'dist'))
  await writeFile(path.join(rootDir, 'dist/index.html'), 'stale ignored frontend')
  const create = () => createTraceableRelease({ rootDir })
  const release = await create()

  await check('fresh build, exact Git manifest and SHA-256', async () => {
    assert.equal(await readFile(path.join(rootDir, 'dist/index.html'), 'utf8'), 'fresh build')
    const archived = await exec('tar', ['-xOf', release.archivePath, 'dist/release.json'])
    const manifest = JSON.parse(archived.stdout)
    assert.equal(manifest.gitCommit, (await git('rev-parse', 'HEAD')).stdout.trim())
    assert.equal(manifest.sourceClean, true)
    assert.equal(manifest.gitBranch, 'main')
    assert.equal(release.sha256, createHash('sha256').update(await readFile(release.archivePath)).digest('hex'))
    const verified = await exec('sha256sum', ['--check', path.basename(release.archivePath) + '.sha256'], { cwd: path.dirname(release.archivePath) })
    assert.match(verified.stdout, /OK/)
  })
  await check('artifact excludes uploads, env, Git and dependencies', async () => {
    const { stdout } = await exec('tar', ['-tzf', release.archivePath])
    assert.doesNotMatch(stdout, /(^|\/)(public|uploads|\.env|\.git|node_modules)(\/|$)/m)
    for (const name of ['dist/index.html', 'server/index.js', 'scripts/index.js', 'package.json', 'package-lock.json']) assert.ok(stdout.includes(name))
  })
  await check('dirty tracked and untracked changes fail before building and preserve prior artifact', async () => {
    const previous = await readFile(release.archivePath)
    for (const name of ['server/index.js', 'untracked.txt']) {
      await writeFile(path.join(rootDir, name), 'uncommitted')
      await assert.rejects(create(), /Commit all source changes/)
      if (name.startsWith('server/')) await git('restore', '--', name)
      else await rm(path.join(rootDir, name))
      assert.deepEqual(await readFile(release.archivePath), previous)
    }
  })
  await check('build-generated uploads cannot ship', async () => {
    process.env.RELEASE_TEST_MODE = 'uploads'
    try { await assert.rejects(create(), /local uploads/) }
    finally { delete process.env.RELEASE_TEST_MODE; await rm(path.join(rootDir, 'dist/uploads'), { recursive: true }) }
  })
  await check('source edits during build fail and preserve prior artifact', async () => {
    const previous = await readFile(release.archivePath)
    process.env.RELEASE_TEST_MODE = 'dirty'
    try { await assert.rejects(create(), /Commit all source changes/) }
    finally { delete process.env.RELEASE_TEST_MODE; await git('restore', '--', 'server/index.js') }
    assert.deepEqual(await readFile(release.archivePath), previous)
  })
  await check('a new commit during build cannot be mislabeled with the previous SHA', async () => {
    process.env.RELEASE_TEST_MODE = 'commit'
    try { await assert.rejects(create(), /Source revision changed/) }
    finally { delete process.env.RELEASE_TEST_MODE }
  })
  await check('deployment rejects an unpushed revision, accepts exact remote branch', async () => {
    const remote = path.join(sandbox, 'origin.git')
    await exec('git', ['init', '--bare', remote])
    await git('remote', 'add', 'origin', remote)
    const current = { gitBranch: 'main', gitCommit: (await git('rev-parse', 'HEAD')).stdout.trim() }
    await assert.rejects(assertPushedRelease(rootDir, current), /Push this exact commit/)
    await git('push', 'origin', 'main')
    await assertPushedRelease(rootDir, current)
    await assert.rejects(assertPushedRelease(rootDir, release), /Push this exact commit/)
    await assert.rejects(assertPushedRelease(rootDir, { ...current, gitBranch: '' }), /named branch/)
  })
  await check('remote checksum gate handles quoted paths and rejects tampering before mutations', async () => {
    const archive = path.join(sandbox, "quoted archive's.tar.gz")
    await writeFile(archive, await readFile(release.archivePath))
    const script = buildRemoteScript({ remoteDir: path.join(sandbox, 'app'), envFile: path.join(sandbox, 'env'), serviceName: 'fixture', domain: 'example.invalid', archivePath: archive, archiveSha256: release.sha256, backupRetain: 0, appOrigin: 'http://127.0.0.1:1' })
    await exec('bash', ['-c', script.slice(0, script.indexOf(PRUNE_FUNCTION))])
    await writeFile(archive, 'corrupted transfer')
    await assert.rejects(exec('bash', ['-c', script]))
    await assert.rejects(readFile(path.join(sandbox, 'env.backup')))
    assert.throws(() => buildRemoteScript({}), /checksum is required/)
    assert.throws(() => buildRemoteScript({ archiveSha256: 'invalid; command' }), /checksum is required/)
  })
} finally {
  delete process.env.RELEASE_TEST_MODE
  await rm(sandbox, { recursive: true, force: true })
}
console.log('Traceable release verification passed: ' + passed + ' scenarios; no VPS connection.')
