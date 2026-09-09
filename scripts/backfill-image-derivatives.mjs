#!/usr/bin/env node
// Generates the derivative images that rows written before 2026-09-10 never
// got, and points those rows at them.
//
// Why this exists: uploads were stored at whatever size they arrived and
// served at that size everywhere. Measured on 2026-09-10 against production,
// the catalogue's four tiles pulled 15.31MB of full-size PNGs -- one of them
// 8.47MB -- and the creator avatar rendered into a 17px circle was 1.75MB.
// server/images.js now shrinks these at upload time; this is the same
// treatment for everything already in the database.
//
// ⚠️ It never deletes or overwrites a file. Every derivative is a NEW file, and
// the original stays on disk byte-for-byte -- required by CLAUDE.md rule 3, and
// right anyway for works, whose covers are assets a buyer downloads.
//
// Writes, and exactly which (CLAUDE.md rule 10):
//   UPDATE works SET thumbnail = $1 WHERE id = $2          -- one row per work
//   UPDATE visitor_users SET avatar_url = $1 WHERE id = $2 -- one row per user
//   UPDATE visitor_users SET banner_url = $1 WHERE id = $2 -- one row per user
// All are single-row updates keyed by primary key. No DELETE, no TRUNCATE, no
// unqualified UPDATE. Nothing runs at all without --apply.
//
//   node scripts/backfill-image-derivatives.mjs            # report only
//   node scripts/backfill-image-derivatives.mjs --apply    # write
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

import { derivativeFileName, renderDerivative } from '../server/images.js'

const { Pool } = pg

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const uploadRoot = path.join(rootDir, 'public', 'uploads')

const apply = process.argv.slice(2).includes('--apply')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required (the same one the service uses).')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

const sizeOf = async (absolute) => {
  try {
    return (await stat(absolute)).size
  } catch {
    return 0
  }
}

const localPath = (url) => {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return ''
  // Nothing here is user-supplied at request time, but a stored value with a
  // traversal in it should still not escape the upload root.
  const resolved = path.resolve(uploadRoot, url.replace('/uploads/', ''))
  return resolved.startsWith(uploadRoot) ? resolved : ''
}

const humanSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`

// Renders one derivative and returns { url, before, after }, or null when the
// source cannot be read. Skipping is always better than failing the run: one
// unreadable file should not stop the other rows from getting smaller.
const buildDerivative = async ({ folder, profileName, sourceUrl, suffix }) => {
  const absolute = localPath(sourceUrl)
  if (!absolute) return null

  let input
  try {
    input = await readFile(absolute)
  } catch {
    console.warn(`  ! missing on disk, skipped: ${sourceUrl}`)
    return null
  }

  let derivative
  try {
    derivative = await renderDerivative(input, profileName)
  } catch (error) {
    console.warn(`  ! could not render ${sourceUrl}: ${error.message}`)
    return null
  }

  const before = await sizeOf(absolute)
  const fileName = derivativeFileName(path.basename(absolute), suffix)
  const url = `/uploads/${folder}/${fileName}`

  if (apply) {
    await mkdir(path.join(uploadRoot, folder), { recursive: true })
    await writeFile(path.join(uploadRoot, folder, fileName), derivative)
  }

  return { after: derivative.length, before, url }
}

let saved = 0

const report = (label, result) => {
  if (!result) return
  saved += result.before - result.after
  console.log(
    `  ${label}: ${humanSize(result.before)} -> ${humanSize(result.after)}  ${result.url}`,
  )
}

const run = async () => {
  console.log(apply ? '=== applying ===' : '=== report only (pass --apply to write) ===')

  console.log('\nworks without a thumbnail:')
  const works = await pool.query(
    `SELECT id, slug, image FROM works
     WHERE image IS NOT NULL AND image <> '' AND (thumbnail IS NULL OR thumbnail = '')
     ORDER BY created_at`,
  )
  if (works.rows.length === 0) console.log('  (none)')

  for (const row of works.rows) {
    const result = await buildDerivative({
      folder: 'thumbnails',
      profileName: 'workThumb',
      sourceUrl: row.image,
      suffix: 'thumb',
    })
    report(row.slug, result)
    if (result && apply) {
      await pool.query('UPDATE works SET thumbnail = $1 WHERE id = $2', [result.url, row.id])
    }
  }

  console.log('\nprofile images:')
  const users = await pool.query(
    `SELECT id, handle, avatar_url, banner_url FROM visitor_users
     WHERE (avatar_url IS NOT NULL AND avatar_url <> '')
        OR (banner_url IS NOT NULL AND banner_url <> '')
     ORDER BY created_at`,
  )
  if (users.rows.length === 0) console.log('  (none)')

  // The UPDATE is written out per column rather than interpolated. `column`
  // here only ever comes from this literal array, but a query built by string
  // concatenation is a shape worth not having in the repository at all.
  const updates = {
    avatar_url: 'UPDATE visitor_users SET avatar_url = $1 WHERE id = $2',
    banner_url: 'UPDATE visitor_users SET banner_url = $1 WHERE id = $2',
  }

  for (const row of users.rows) {
    for (const [column, folder, profileName, sourceUrl] of [
      ['avatar_url', 'avatars', 'avatar', row.avatar_url],
      ['banner_url', 'banners', 'banner', row.banner_url],
    ]) {
      if (!sourceUrl) continue
      // Already a derivative: this script is safe to re-run, and re-encoding a
      // webp every time it runs would lose quality for no gain.
      if (sourceUrl.endsWith('.webp')) {
        console.log(`  @${row.handle} ${column}: already a derivative, skipped`)
        continue
      }

      const result = await buildDerivative({
        folder,
        profileName,
        sourceUrl,
        suffix: profileName,
      })
      report(`@${row.handle} ${column}`, result)
      if (result && apply) {
        await pool.query(updates[column], [result.url, row.id])
      }
    }
  }

  console.log(`\ntotal saved on the pages that load these: ${humanSize(Math.max(0, saved))}`)
  if (!apply) console.log('Nothing was written. Re-run with --apply.')
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
