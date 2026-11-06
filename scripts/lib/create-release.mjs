import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

import { archiveItems, assertNoUploadsInBuild } from './release-contents.mjs'

const exec = promisify(execFile)
const git = async (rootDir, args) => (await exec('git', args, { cwd: rootDir })).stdout.trim()

const cleanRevision = async (rootDir) => {
  if (await git(rootDir, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Commit all source changes before packaging a traceable release.')
  }
  return {
    gitCommit: await git(rootDir, ['rev-parse', 'HEAD']),
    gitBranch: await git(rootDir, ['branch', '--show-current']),
  }
}

export const assertPushedRelease = async (rootDir, release) => {
  if (!release.gitBranch) throw new Error('Deploy from a named branch already pushed to origin.')
  const remote = await git(rootDir, ['ls-remote', 'origin', 'refs/heads/' + release.gitBranch])
  if (remote.split(/\s+/)[0] !== release.gitCommit) {
    throw new Error('Push this exact commit to origin before deploying. No server changes were made.')
  }
}

// Both entry points build from a clean revision, then package that same tree.
// A fresh build prevents an ignored dist/ from carrying an older frontend SHA.
export const createTraceableRelease = async ({ rootDir = process.cwd(), archivePath } = {}) => {
  const revision = await cleanRevision(rootDir)
  const build = await exec('npm', ['run', 'build'], { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 })
  if (build.stdout) process.stdout.write(build.stdout)
  if (build.stderr) process.stderr.write(build.stderr)
  await assertNoUploadsInBuild(rootDir)
  const manifest = { formatVersion: 1, ...revision, builtAt: new Date().toISOString(), sourceClean: true }
  await writeFile(path.join(rootDir, 'dist', 'release.json'), JSON.stringify(manifest, null, 2) + '\n')

  const target = archivePath || path.join(rootDir, '.deploy-tools', 'mrright-portfolio-release.tar.gz')
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = target + '.' + process.pid + '.tmp'
  try {
    await exec('tar', ['-czf', temporary, ...archiveItems], { cwd: rootDir })
    const after = await cleanRevision(rootDir)
    if (after.gitCommit !== revision.gitCommit || after.gitBranch !== revision.gitBranch) {
      throw new Error('Source revision changed while building; release was not published.')
    }
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(temporary)) hash.update(chunk)
    const sha256 = hash.digest('hex')
    const { size } = await stat(temporary)
    await rename(temporary, target)
    await writeFile(target + '.sha256', sha256 + '  ' + path.basename(target) + '\n')
    return { ...manifest, archivePath: target, sha256, size }
  } finally {
    await rm(temporary, { force: true })
  }
}
