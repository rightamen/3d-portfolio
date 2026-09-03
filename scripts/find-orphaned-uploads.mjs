#!/usr/bin/env node
// Measures how many files under public/uploads/ are orphaned -- written to
// disk by an upload that was never claimed by a database row (a community
// post cover picked and then abandoned before the post was submitted; a
// project image replaced by a later save; a profile photo swapped out).
// Nobody has ever measured this, and this script is only the measurement.
//
// It is read-only, on purpose and by hard project rule (see CLAUDE.md: never
// delete uploaded files). Every database query below is a SELECT, and this
// file never calls fs.unlink, fs.rm, or anything else that would touch
// public/uploads/. If the count this prints is ever worth acting on, that is
// a separate, human-reviewed tool -- not an extra flag on this one.
//
// The five upload subdirectories and what can reference a file in each:
//   images/    community_posts.image_url, community_uploads.file_url (when
//              file_type is an image), community_uploads.preview_url,
//              project images (base catalogue + project_overrides + custom_projects)
//   avatars/   visitor_users.avatar_url
//   banners/   visitor_users.banner_url
//   models/    community_uploads.file_url (when file_type is a model),
//              project model_url (base catalogue + project_overrides + custom_projects)
//   projects/  <slug>-source.zip archives -- these carry no URL column at
//              all (server/index.js's projectArchivePath builds the name from
//              a slug, never stores it). A slug that still exists in the
//              merged catalogue is the only thing that makes one "in use", so
//              this script derives the expected archive path for every slug
//              still in the catalogue and treats that the same as any other
//              reference.
//
// Project images/models are read through server/postgres/projectStore.js's
// own listProjects (base content.js + project_overrides + custom_projects,
// minus deleted_projects), with includeHidden so a hidden-but-real project's
// files are never mistaken for orphans -- reusing that merge instead of
// re-deriving it is what keeps this script from disagreeing with the site
// about which projects exist.
//
//   node scripts/find-orphaned-uploads.mjs
//   node scripts/find-orphaned-uploads.mjs --json
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

import { projects as staticProjects } from '../server/content.js'
import { findOrphanedFiles } from '../server/orphanedUploads.js'
import { createProjectStore } from '../server/postgres/projectStore.js'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const uploadRoot = path.join(rootDir, 'public', 'uploads')

// Kept in one place because it is asserted against server/index.js's own
// multer destinations in the header comment above -- if a sixth folder is
// ever added there, it belongs here too.
const UPLOAD_SUBDIRS = ['images', 'avatars', 'banners', 'models', 'projects']

const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')

const die = (message) => {
  console.error(message)
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) die('DATABASE_URL is required (the same one the service uses).')

const pool = new Pool({ connectionString: databaseUrl })

const addPath = (referencedPaths, value) => {
  if (typeof value === 'string' && value.trim()) referencedPaths.add(value.trim())
}

// Every column that can hold an /uploads/... path, per the reference map this
// script was built against. All SELECTs -- nothing here writes.
const collectReferencedPaths = async () => {
  const referencedPaths = new Set()

  const posts = await pool.query('SELECT image_url FROM community_posts')
  for (const row of posts.rows) addPath(referencedPaths, row.image_url)

  const uploads = await pool.query('SELECT file_url, preview_url FROM community_uploads')
  for (const row of uploads.rows) {
    addPath(referencedPaths, row.file_url)
    addPath(referencedPaths, row.preview_url)
  }

  const users = await pool.query('SELECT avatar_url, banner_url FROM visitor_users')
  for (const row of users.rows) {
    addPath(referencedPaths, row.avatar_url)
    addPath(referencedPaths, row.banner_url)
  }

  // Base + project_overrides + custom_projects, minus deleted_projects, via
  // the store's own merge -- see the header comment for why this is not
  // reimplemented here. includeHidden: a hidden project's files are still in
  // use, only invisible to the public list.
  const projectStore = createProjectStore({ pool })
  const projects = await projectStore.listProjects(staticProjects, { includeHidden: true })
  for (const project of projects) {
    addPath(referencedPaths, project.image)
    addPath(referencedPaths, project.modelUrl)
    // projects/<slug>-source.zip has no column of its own; a project that
    // still exists is what makes its archive "in use" (see projectArchivePath
    // in server/index.js).
    if (project.slug) referencedPaths.add(`/uploads/projects/${project.slug}-source.zip`)
  }

  return referencedPaths
}

// Walks the five known subdirectories and turns every regular file into the
// same URL-style shape a database column stores, so it can be compared
// exactly. Missing subdirectories are not an error -- a fresh checkout or a
// server that never received a particular kind of upload simply has fewer of
// them.
const walkUploads = async () => {
  const files = []

  for (const subdir of UPLOAD_SUBDIRS) {
    const dir = path.join(uploadRoot, subdir)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const absolute = path.join(dir, entry.name)
      const stats = await stat(absolute)
      files.push({
        mtimeMs: stats.mtimeMs,
        path: `/uploads/${subdir}/${entry.name}`,
        size: stats.size,
      })
    }
  }

  return files
}

const humanSize = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

const ageDays = (mtimeMs) => Math.floor((Date.now() - mtimeMs) / (24 * 60 * 60 * 1000))

const printReport = (orphans, { totalFiles }) => {
  if (!orphans.length) {
    console.log(`No orphaned files found (${totalFiles} files scanned under public/uploads/).`)
    return
  }

  const totalBytes = orphans.reduce((sum, file) => sum + file.size, 0)
  console.log(
    `${orphans.length} of ${totalFiles} files under public/uploads/ appear orphaned ` +
      `(${humanSize(totalBytes)} total). Oldest first:`,
  )
  console.log('')

  for (const file of orphans) {
    console.log(`  ${String(ageDays(file.mtimeMs)).padStart(5)}d  ${humanSize(file.size).padStart(9)}  ${file.path}`)
  }
  console.log('')
  console.log('This is a report only. Nothing was deleted or modified.')
}

try {
  let referencedPaths
  try {
    referencedPaths = await collectReferencedPaths()
  } catch (error) {
    die(`Could not read from the database: ${error.message}`)
  }

  const files = await walkUploads()
  const orphans = findOrphanedFiles({ files, referencedPaths })
  orphans.sort((a, b) => a.mtimeMs - b.mtimeMs)

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          orphans: orphans.map((file) => ({
            ageDays: ageDays(file.mtimeMs),
            mtime: new Date(file.mtimeMs).toISOString(),
            path: file.path,
            size: file.size,
          })),
          totalFiles: files.length,
        },
        null,
        2,
      ),
    )
  } else {
    printReport(orphans, { totalFiles: files.length })
  }
} finally {
  await pool.end()
}

// A report, not a test -- always exits clean unless the database connection
// itself failed above (which already exited via die()).
process.exit(0)
