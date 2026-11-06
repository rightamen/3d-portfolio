import { createTraceableRelease } from './lib/create-release.mjs'
import { buildRemoteScript } from './lib/deploy-remote-script.mjs'

const release = await createTraceableRelease()
console.log('Created ' + release.archivePath + ' (' + (release.size / 1024 / 1024).toFixed(2) + ' MB)')
console.log('Git commit: ' + release.gitCommit)
console.log('SHA-256: ' + release.sha256)
console.log('Push this commit to GitHub, then upload the archive to /tmp/mrright-portfolio-release.tar.gz.')
console.log('Back up the production database and verify the dump before running the script below:')
console.log(buildRemoteScript({
  remoteDir: '/opt/mrright-portfolio',
  envFile: '/etc/mrright-portfolio.env',
  serviceName: 'mrright-portfolio',
  domain: 'mrright.blog',
  archivePath: '/tmp/mrright-portfolio-release.tar.gz',
  archiveSha256: release.sha256,
  backupRetain: 0,
  appOrigin: 'http://127.0.0.1:4173',
}))
