import { stat } from 'node:fs/promises'
import path from 'node:path'

// What ships. public/ is deliberately absent: on the VPS, public/uploads is the
// live upload store and must survive a deploy, so it is never overwritten from
// a release.
export const archiveItems = ['dist', 'server', 'scripts', 'package.json', 'package-lock.json']

// vite copies public/ into dist/, uploads included, and dist/ is what gets
// tarred — so anything sitting in public/uploads at build time rides along to
// production. It is not served there (the /uploads express mount is registered
// before the dist handler, and it reads the persistent directory), but the API
// contract suite writes real files into public/uploads, and shipping local test
// output to a server should not depend on a shadowing rule holding.
//
// vite.config.js drops dist/uploads after every build. This is the check that
// the drop actually happened: a stale dist, or a build run through a config
// without that plugin, is exactly the case worth catching before the upload.
export const assertNoUploadsInBuild = async (rootDir) => {
  const distUploads = path.join(rootDir, 'dist', 'uploads')

  try {
    await stat(distUploads)
  } catch {
    return // absent, which is the expected state
  }

  throw new Error(
    `${distUploads} exists, so this release would carry local uploads to the server.\n` +
      'Re-run npm run build (vite.config.js removes it), or delete dist/ and build again.',
  )
}
