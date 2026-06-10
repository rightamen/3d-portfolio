import { readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()

const requiredMarkers = [
  {
    file: 'src/pages/AccountPage.jsx',
    markers: [
      'visitor-studio-upload',
      'accountStudioUploadNow',
      'getAccountCommunity',
      'uploadCommunityResource',
    ],
  },
  {
    file: 'src/lib/api.js',
    markers: [
      '/api/account/community',
      'deleteAccountCommunityUpload',
      'deleteAccountCommunityPost',
    ],
  },
  {
    file: 'server/index.js',
    markers: [
      "app.get('/api/account/community'",
      "app.delete('/api/account/community/uploads/:id'",
      "app.delete('/api/account/community/posts/:id'",
    ],
  },
  {
    file: 'server/postgresStores.js',
    markers: ['listUserUploads', 'listUserPosts', 'deleteUserUpload', 'deleteUserPost'],
  },
  {
    file: 'src/lib/i18n.js',
    markers: ['accountStudioUploadNow', '上传资源', 'Upload Resource'],
  },
  {
    file: 'package.json',
    markers: ['release:vps'],
  },
]

const missing = []

for (const requirement of requiredMarkers) {
  const absolutePath = path.join(rootDir, requirement.file)
  const contents = await readFile(absolutePath, 'utf8')

  for (const marker of requirement.markers) {
    if (!contents.includes(marker)) {
      missing.push(`${requirement.file}: ${marker}`)
    }
  }
}

if (missing.length > 0) {
  console.error('Visitor Studio verification failed. Missing markers:')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

console.log('Visitor Studio verification passed.')
console.log('The release contains the account upload entry, account community APIs, and VPS packager script.')
console.log('Next: run `npm run release:vps`, upload `.deploy-tools/mrright-portfolio-release.tar.gz`, then apply it on the VPS.')
