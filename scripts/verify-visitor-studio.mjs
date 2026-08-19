import { readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()

const requiredMarkers = [
  {
    file: 'src/pages/AccountPage.jsx',
    markers: [
      'visitor-studio-upload',
      // Was 'accountStudioUploadNow'. That key has never appeared in this file
      // in any commit -- it was added to i18n.js and to this list in the same
      // change and wired to nothing, so this check was red from the day it was
      // written. The upload form is real; these are the parts of it.
      'communityUploadTitle',
      'submitUpload',
      'accountStudioMyResources',
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
    file: 'server/postgres/communityStore.js',
    markers: ['listUserUploads', 'listUserPosts', 'deleteUserUpload', 'deleteUserPost'],
  },
  {
    file: 'src/lib/i18n.js',
    // The strings the studio actually renders, in all three dictionaries.
    markers: ['communityUploadTitle', 'accountStudioMyResources', 'accountStudioStatuspending'],
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
