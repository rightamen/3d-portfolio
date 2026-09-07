#!/usr/bin/env node
// Copies the site's existing projects into the new `works` table, owned by a
// creator. Phase 1 of docs/adr/ADR_PLATFORM_PIVOT.md.
//
// Read the projects the way the SITE reads them, not the way content.js
// declares them. A project on mrright.blog is content.js merged with
// project_overrides, plus custom_projects, minus deleted_projects -- so the
// only faithful source is projectStore.listProjects, which is exactly what
// /api/projects calls. Reading content.js directly would migrate titles and
// model URLs that no visitor has ever seen.
//
//   node scripts/migrate-works.mjs --creator right              # dry run
//   node scripts/migrate-works.mjs --creator right --commit     # writes
//
// COPIES, never moves: project_overrides, custom_projects and content.js are
// left exactly as they are, and /projects/:slug keeps working. Nothing reads
// `works` yet, so a bad run costs a DELETE and a re-run rather than an outage.
//
// Idempotent: works.source/source_slug record where each row came from, so a
// second run updates the rows it made before instead of duplicating them, and
// never touches a work whose source is something else (an upload, say).

import { stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

import { projects as staticProjects } from '../server/content.js'
import { createProjectStore } from '../server/postgres/projectStore.js'

const { Pool } = pg

const die = (message) => {
  console.error(message)
  process.exit(1)
}

const argOf = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const commit = process.argv.includes('--commit')
const creatorHandle = String(argOf('--creator') ?? '').replace(/^@/, '').toLowerCase()
if (!creatorHandle) die('Usage: node scripts/migrate-works.mjs --creator <handle> [--commit]')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) die('DATABASE_URL is not set.')

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Two roots, because the server serves from two. /uploads/... is read from
// public/uploads, while a content-hashed model like
// /models/fire-extinguisher-4k.3fa834b2.glb is a build output and exists only
// in dist/. Looking in public/ alone reported that one as unreadable, which is
// how this list got a second entry.
const assetRoots = [path.join(rootDir, 'public'), path.join(rootDir, 'dist')]

// The byte count of a file this server serves, or 0 when it cannot be read.
//
// It matters more than the file list it decorates: enforceUploadQuota sums
// work_assets.file_size, so an asset recorded as 0 bytes is an asset that does
// not count against anybody's storage budget. Migrated rows had exactly that
// problem -- the first version of this script inserted them without ever
// looking at the files.
const fileSize = async (fileUrl) => {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/')) return 0

  for (const root of assetRoots) {
    const localPath = path.resolve(root, fileUrl.replace(/^\//, ''))
    // Never follow a path out of the root: the URLs come from the database,
    // and a stat() driven by stored data should not walk the filesystem.
    if (!localPath.startsWith(root + path.sep)) continue

    try {
      return (await stat(localPath)).size
    } catch {
      // Try the next root; only "in none of them" means unreadable.
    }
  }

  return 0
}

// A slug that came from custom_projects exists in that table; anything else is
// a content.js project, whether or not project_overrides has a row for it.
// This is only used for the audit trail, so a wrong guess is cosmetic.
const sourceOf = (slug, customSlugs) => (customSlugs.has(slug) ? 'custom_projects' : 'content')

const localizedColumns = [
  ['title_zh', 'titleZh'],
  ['title_en', 'titleEn'],
  ['title_ja', 'titleJa'],
  ['summary_zh', 'summaryZh'],
  ['summary_en', 'summaryEn'],
  ['summary_ja', 'summaryJa'],
  ['workflow_zh', 'workflowZh'],
  ['workflow_en', 'workflowEn'],
  ['workflow_ja', 'workflowJa'],
  ['format_zh', 'formatZh'],
  ['format_en', 'formatEn'],
  ['format_ja', 'formatJa'],
  ['model_size_zh', 'modelSizeZh'],
  ['model_size_en', 'modelSizeEn'],
  ['model_size_ja', 'modelSizeJa'],
  ['download_policy_zh', 'downloadPolicyZh'],
  ['download_policy_en', 'downloadPolicyEn'],
  ['download_policy_ja', 'downloadPolicyJa'],
]

const plainColumns = [
  ['title', 'title'],
  ['summary', 'summary'],
  ['workflow', 'workflow'],
  ['format', 'format'],
  ['model_size', 'modelSize'],
  ['download_policy', 'downloadPolicy'],
  ['year', 'year'],
  ['asset_category', 'assetCategory'],
  ['image', 'image'],
  ['model_url', 'modelUrl'],
]

const pool = new Pool({ connectionString: databaseUrl })
let exitCode = 0

try {
  const creator = (
    await pool.query(
      'SELECT id, handle, email, creator_enabled_at FROM visitor_users WHERE lower(handle) = $1',
      [creatorHandle],
    )
  ).rows[0]

  if (!creator) {
    die(
      `No account has the handle @${creatorHandle}.\n` +
        'Create one first:  node scripts/creator-account.mjs create <handle> <email>',
    )
  }
  if (!creator.creator_enabled_at) {
    die(
      `@${creatorHandle} is not a creator yet.\n` +
        `Enable it first:  node scripts/creator-account.mjs enable ${creatorHandle}`,
    )
  }

  const projectStore = createProjectStore({ pool })
  // includeHidden, because a hidden project is still the creator's work; it
  // migrates as status 'hidden' rather than being silently dropped.
  const projects = await projectStore.listProjects(staticProjects, { includeHidden: true })

  const customSlugs = new Set(
    (await pool.query('SELECT slug FROM custom_projects')).rows.map((row) => row.slug),
  )

  const existing = new Map(
    (
      await pool.query(
        `SELECT id, slug, source, source_slug FROM works WHERE creator_id = $1`,
        [creator.id],
      )
    ).rows.map((row) => [row.slug, row]),
  )

  console.log(`Creator:  @${creator.handle} (${creator.email})`)
  console.log(`Projects: ${projects.length} visible to the site`)
  console.log(`Works:    ${existing.size} already owned by this creator`)
  console.log(commit ? '\nWriting.\n' : '\nDRY RUN -- pass --commit to write.\n')

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const project of projects) {
    const status = project.isPublic === false ? 'hidden' : 'published'
    const previous = existing.get(project.slug)

    if (previous && previous.source === 'upload') {
      console.log(`skip    ${project.slug} -- a work with this slug came from an upload`)
      skipped += 1
      continue
    }

    const values = {
      source: sourceOf(project.slug, customSlugs),
      source_slug: project.slug,
      stack: JSON.stringify(project.stack ?? []),
      status,
      viewer_features: JSON.stringify(project.viewerFeatures ?? []),
    }
    for (const [column, field] of [...plainColumns, ...localizedColumns]) {
      values[column] = project[field] ?? null
    }
    // The four existing works are the owner's portfolio, not stock: they
    // migrate free, and a price is something the owner sets deliberately later.
    values.price_cents = 0
    values.currency = 'usd'

    if (!values.title) {
      console.log(`skip    ${project.slug} -- no title`)
      skipped += 1
      continue
    }
    values.summary = values.summary ?? ''

    if (previous) {
      const columns = Object.keys(values)
      if (commit) {
        await pool.query(
          `UPDATE works SET ${columns.map((c, i) => `${c} = $${i + 3}`).join(', ')},
             published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
             updated_at = now()
           WHERE id = $1`,
          [previous.id, status, ...columns.map((c) => values[c])],
        )
      }
      console.log(`update  ${project.slug} (${status})`)
      updated += 1
      continue
    }

    const id = createId()
    const columns = ['id', 'creator_id', 'slug', ...Object.keys(values)]
    const params = [id, creator.id, project.slug, ...Object.keys(values).map((c) => values[c])]

    if (commit) {
      await pool.query(
        `INSERT INTO works (${columns.join(', ')}, published_at)
         VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')},
                 CASE WHEN $${params.length + 1} = 'published' THEN now() ELSE null END)`,
        [...params, status],
      )

      // One asset row per file the project actually has. work_assets is the
      // real home for these from now on; works.image/model_url stay populated
      // so the existing viewer keeps working unchanged.
      const assets = [
        project.image ? { kind: 'preview', url: project.image } : null,
        project.modelUrl ? { kind: 'model', url: project.modelUrl } : null,
      ].filter(Boolean)

      for (const [index, asset] of assets.entries()) {
        await pool.query(
          `INSERT INTO work_assets
             (id, work_id, kind, file_name, file_type, file_url, file_size, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            createId(),
            id,
            asset.kind,
            asset.url.split('/').pop() || asset.url,
            asset.url.split('.').pop()?.toLowerCase() || '',
            asset.url,
            await fileSize(asset.url),
            index,
          ],
        )
      }
    }

    console.log(`insert  ${project.slug} (${status})`)
    inserted += 1
  }

  // Rows written before this script recorded sizes. Idempotent, and scoped to
  // the zeros: an asset whose file is genuinely missing stays 0 and shows up
  // again next run rather than being papered over.
  const zeroSized = await pool.query(
    `SELECT work_assets.id, work_assets.file_url
     FROM work_assets
     JOIN works ON works.id = work_assets.work_id
     WHERE works.creator_id = $1 AND work_assets.file_size = 0`,
    [creator.id],
  )

  let backfilled = 0
  for (const row of zeroSized.rows) {
    const size = await fileSize(row.file_url)
    if (!size) {
      console.log(`size?   ${row.file_url} -- not found under public/ or dist/`)
      continue
    }
    if (commit) {
      await pool.query('UPDATE work_assets SET file_size = $2 WHERE id = $1', [row.id, size])
    }
    backfilled += 1
  }

  if (zeroSized.rows.length) {
    console.log(`\n${backfilled}/${zeroSized.rows.length} asset size(s) to backfill.`)
  }

  console.log(`\n${inserted} to insert, ${updated} to update, ${skipped} skipped.`)

  if (commit) {
    const total = (
      await pool.query('SELECT count(*)::int AS count FROM works WHERE creator_id = $1', [
        creator.id,
      ])
    ).rows[0].count
    const assets = (
      await pool.query(
        `SELECT count(*)::int AS count FROM work_assets
         JOIN works ON works.id = work_assets.work_id
         WHERE works.creator_id = $1`,
        [creator.id],
      )
    ).rows[0].count
    console.log(`@${creator.handle} now owns ${total} work(s) and ${assets} asset row(s).`)
  }
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  await pool.end()
}

process.exit(exitCode)
