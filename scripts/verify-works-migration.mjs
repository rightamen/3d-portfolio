#!/usr/bin/env node
// Rehearses scripts/migrate-works.mjs against a disposable database, seeded to
// look like production, before it is ever pointed at production.
//
// It runs the real scripts as subprocesses -- creator-account.mjs and
// migrate-works.mjs, not reimplementations of them -- because the thing worth
// proving is that the code that will touch the live database does the right
// thing, and a parallel implementation in a test proves only that two pieces
// of code agree.
//
// What it pins down, all of which would be expensive to discover afterwards:
//   * a project_overrides row wins over content.js, so the migrated title is
//     the one visitors actually see (this project has been bitten by that)
//   * a deleted project does NOT come back
//   * a hidden project migrates as hidden rather than vanishing
//   * --commit is required; the default run writes nothing
//   * running it twice does not duplicate anything
//
//   node scripts/verify-works-migration.mjs
//
// Never reads DATABASE_URL and never touches a real cluster.
import { spawnSync } from 'node:child_process'
import process from 'node:process'

import pg from 'pg'

import { ensureSchema } from '../server/postgres/schema.js'
import { startDisposablePostgres } from './lib/disposable-postgres.mjs'

const TEST_DATABASE_NAME = 'mrright_works_migration_test'
const HANDLE = 'test-creator'
const PASSWORD = 'rehearsal-password-not-a-secret'

const log = (message) => console.log(`[works] ${message}`)
const failures = []
const check = (ok, message) => {
  if (ok) log(`ok    ${message}`)
  else {
    failures.push(message)
    console.error(`[works] FAIL  ${message}`)
  }
}

const run = (script, args, { input, databaseUrl }) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    input,
  })

let cluster = null
let pool = null

try {
  cluster = await startDisposablePostgres({ databaseName: TEST_DATABASE_NAME, log })
  const { databaseUrl } = cluster

  const { Pool } = pg
  pool = new Pool({ connectionString: databaseUrl })
  await ensureSchema(pool)

  // Seeded to mirror the real site's shape: custom projects, an override on a
  // bundled project, a hidden one, and a bundled project that was deleted.
  await pool.query(`
    INSERT INTO custom_projects (slug, title, title_zh, summary, year, image, model_url, asset_category, is_public)
    VALUES
      -- A path that really exists in public/, so the size backfill has
      -- something true to measure. The model path deliberately does not.
      ('rehearsal-public', 'Rehearsal Public', '演练公开', 'A public custom project.', '2026',
       '/assets/projects/fire-extinguisher.png', '/uploads/models/rehearsal.glb', 'hand-painted-scene', true),
      ('rehearsal-hidden', 'Rehearsal Hidden', '演练隐藏', 'A hidden custom project.', '2026',
       '/uploads/images/hidden.png', null, 'hand-painted-prop', false);

    INSERT INTO project_overrides (slug, title, summary)
    VALUES ('fire-extinguisher-next-gen', 'Overridden Title', 'Overridden summary.');

    INSERT INTO deleted_projects (slug) VALUES ('learning-visual-system');
  `)

  log('Creating the creator through the real script...')
  const created = run('scripts/creator-account.mjs', ['create', HANDLE, 'rehearsal@example.test'], {
    databaseUrl,
    input: `${PASSWORD}\n${PASSWORD}\n`,
  })
  check(created.status === 0, `creator-account.mjs create exited 0 (${created.stderr.trim()})`)

  const migrateBlocked = run('scripts/migrate-works.mjs', ['--creator', 'nobody-here'], {
    databaseUrl,
  })
  check(
    migrateBlocked.status !== 0 && /No account has the handle/.test(migrateBlocked.stderr),
    'migrating for a handle nobody owns refuses instead of guessing',
  )

  log('Dry run...')
  const dry = run('scripts/migrate-works.mjs', ['--creator', HANDLE], { databaseUrl })
  check(dry.status === 0, 'the dry run exited 0')
  check(/DRY RUN/.test(dry.stdout), 'the dry run says so')
  const afterDry = (await pool.query('SELECT count(*)::int AS count FROM works')).rows[0].count
  check(afterDry === 0, 'the dry run wrote nothing')

  log('Committing...')
  const committed = run('scripts/migrate-works.mjs', ['--creator', HANDLE, '--commit'], {
    databaseUrl,
  })
  check(committed.status === 0, `the commit run exited 0 (${committed.stderr.trim()})`)

  const works = new Map(
    (await pool.query('SELECT * FROM works')).rows.map((row) => [row.slug, row]),
  )

  check(!works.has('learning-visual-system'), 'a deleted project did not come back')
  check(works.has('rehearsal-public'), 'a custom project migrated')
  check(
    works.get('rehearsal-hidden')?.status === 'hidden',
    'a hidden project migrated as hidden rather than being dropped',
  )
  check(
    works.get('rehearsal-public')?.status === 'published',
    'a visible project migrated as published',
  )
  check(
    works.get('rehearsal-public')?.published_at !== null,
    'a published work got a published_at',
  )
  check(
    works.get('rehearsal-hidden')?.published_at === null,
    'a hidden work did not get a published_at',
  )

  // The one that matters most: content.js says "Next-Gen Fire Extinguisher",
  // the database says otherwise, and the database is what visitors see.
  check(
    works.get('fire-extinguisher-next-gen')?.title === 'Overridden Title',
    'the override won over content.js, not the other way round',
  )
  check(
    works.get('fire-extinguisher-next-gen')?.summary === 'Overridden summary.',
    'the overridden summary came through too',
  )
  // ...while the fields the override left alone still come from content.js.
  check(
    works.get('fire-extinguisher-next-gen')?.title_zh === '次世代灭火器',
    'a field the override did not set still comes from content.js',
  )

  check(
    works.get('rehearsal-public')?.title_zh === '演练公开',
    'the Chinese title survived the migration',
  )
  check(works.get('rehearsal-public')?.price_cents === 0, 'migrated works are free, not unpriced')
  check(
    works.get('rehearsal-public')?.source === 'custom_projects' &&
      works.get('fire-extinguisher-next-gen')?.source === 'content',
    'each work records where it came from',
  )

  const assets = (
    await pool.query(
      `SELECT kind, file_url FROM work_assets
       JOIN works ON works.id = work_assets.work_id
       WHERE works.slug = 'rehearsal-public' ORDER BY kind`,
    )
  ).rows
  check(
    assets.length === 2 && assets[0].kind === 'model' && assets[1].kind === 'preview',
    `a work with an image and a model got both asset rows (got ${assets.length})`,
  )
  const hiddenAssets = (
    await pool.query(
      `SELECT count(*)::int AS count FROM work_assets
       JOIN works ON works.id = work_assets.work_id
       WHERE works.slug = 'rehearsal-hidden'`,
    )
  ).rows[0].count
  check(hiddenAssets === 1, 'a work with no model got one asset row, not an empty one')

  // enforceUploadQuota sums work_assets.file_size, so a migrated asset stored
  // as 0 bytes is one that does not count against anybody's storage budget.
  const sizes = (
    await pool.query(
      `SELECT kind, file_size::int AS size FROM work_assets
       JOIN works ON works.id = work_assets.work_id
       WHERE works.slug = 'rehearsal-public' ORDER BY kind`,
    )
  ).rows
  const preview = sizes.find((row) => row.kind === 'preview')
  const model = sizes.find((row) => row.kind === 'model')
  check(preview?.size > 0, `a migrated asset records its real byte count (got ${preview?.size})`)
  check(
    model?.size === 0,
    'an asset whose file is missing stays 0 rather than being given a made-up size',
  )

  // Zero it and run again: the backfill is what repairs rows the first version
  // of this script wrote without ever looking at the files.
  await pool.query(`UPDATE work_assets SET file_size = 0`)
  const backfill = run('scripts/migrate-works.mjs', ['--creator', HANDLE, '--commit'], { databaseUrl })
  check(backfill.status === 0, 'the backfill run exited 0')
  const repaired = (
    await pool.query(
      `SELECT file_size::int AS size FROM work_assets
       JOIN works ON works.id = work_assets.work_id
       WHERE works.slug = 'rehearsal-public' AND work_assets.kind = 'preview'`,
    )
  ).rows[0]
  check(repaired?.size > 0, `a zeroed size is backfilled on a later run (got ${repaired?.size})`)

  log('Running it a second time...')
  const before = (await pool.query('SELECT count(*)::int AS c FROM works')).rows[0].c
  const beforeAssets = (await pool.query('SELECT count(*)::int AS c FROM work_assets')).rows[0].c
  const again = run('scripts/migrate-works.mjs', ['--creator', HANDLE, '--commit'], { databaseUrl })
  check(again.status === 0, 'the second run exited 0')
  const after = (await pool.query('SELECT count(*)::int AS c FROM works')).rows[0].c
  const afterAssets = (await pool.query('SELECT count(*)::int AS c FROM work_assets')).rows[0].c
  check(after === before, `a second run did not duplicate works (${before} -> ${after})`)
  check(
    afterAssets === beforeAssets,
    `a second run did not duplicate assets (${beforeAssets} -> ${afterAssets})`,
  )

  // The source tables are untouched: this is a copy, and /projects/:slug has to
  // keep working until the new URLs replace it.
  const customs = (await pool.query('SELECT count(*)::int AS c FROM custom_projects')).rows[0].c
  const overrides = (await pool.query('SELECT count(*)::int AS c FROM project_overrides')).rows[0].c
  check(customs === 2 && overrides === 1, 'the source tables were left exactly as they were')
} catch (error) {
  console.error(error)
  failures.push(error.message)
} finally {
  if (pool) await pool.end().catch(() => {})
  if (cluster) cluster.teardown()
}

if (failures.length) {
  console.error(`\n[works] ${failures.length} check(s) failed.`)
  process.exit(1)
}

console.log('\n[works] The migration is faithful, idempotent, and writes nothing without --commit.')
