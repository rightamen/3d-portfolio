#!/usr/bin/env node
// Moves the site owner's About / Toolkit / Timeline out of content.js and into
// their visitor_users row, so they use the same path every other creator now
// does.
//
// Why this has to run: those blocks used to be rendered from content.js behind
// an isSiteOwner check. That check is gone -- every creator renders their own
// content from their own row -- so without this the owner's profile simply
// loses its About section.
//
// ⚠️ It takes the CHINESE text only. The new columns are single-language by
// design (see server/creatorProfile.js): asking every creator to write their
// introduction three times produces one filled field and two blank ones. The
// owner is the one account that genuinely has zh/en/ja, and this migration
// keeps only zh.
//
// content.js is NOT modified and NOT deleted. The English and Japanese text
// stays exactly where it is, so nothing is lost and it can be pasted back in by
// hand if the owner prefers a different language.
//
// Writes, and exactly which (CLAUDE.md rule 10):
//   UPDATE visitor_users SET about = $1, highlights = $2, skills = $3,
//                            experience = $4
//   WHERE id = $5
// One row, by primary key. Nothing else is touched, nothing is deleted, and it
// refuses to overwrite content the owner has already written unless --force.
//
//   node scripts/migrate-owner-profile-content.mjs              # report only
//   node scripts/migrate-owner-profile-content.mjs --apply
//   node scripts/migrate-owner-profile-content.mjs --apply --force
import pg from 'pg'

import { experience as staticExperience, profile as staticProfile, skills as staticSkills } from '../server/content.js'
import { normalizeCreatorProfileContent } from '../server/creatorProfile.js'

const { Pool } = pg

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const force = args.includes('--force')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required (the same one the service uses).')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

const run = async () => {
  // The owner is identified by the email content.js already carries, which is
  // the same rule the server uses to decide siteOwner. Matching on the display
  // name would be wrong -- it is a field the owner can change.
  const email = String(staticProfile.email || '').trim().toLowerCase()
  if (!email) throw new Error('content.js has no profile.email to match on.')

  const found = await pool.query(
    'SELECT id, handle, about, highlights, skills, experience FROM visitor_users WHERE lower(email) = $1',
    [email],
  )
  const owner = found.rows[0]
  if (!owner) {
    console.log('No account matches the email in content.js. Nothing to do.')
    return
  }

  const existing = {
    about: owner.about || '',
    experience: Array.isArray(owner.experience) ? owner.experience : [],
    highlights: Array.isArray(owner.highlights) ? owner.highlights : [],
    skills: Array.isArray(owner.skills) ? owner.skills : [],
  }
  const alreadyWritten =
    existing.about || existing.highlights.length || existing.skills.length || existing.experience.length

  // Through the same normaliser the API uses, so the migrated content obeys
  // exactly the limits a creator typing it in would hit -- rather than being
  // the one profile on the site that is over them.
  const content = normalizeCreatorProfileContent({
    about: [staticProfile.aboutZh, staticProfile.intro].filter(Boolean).join('\n\n'),
    experience: staticExperience.map((item) => ({
      body: item.body,
      period: item.period,
      title: item.title,
    })),
    // content.js highlights are plain strings; a highlight card is a title and
    // an optional body, so they become titles.
    highlights: (staticProfile.highlights || []).map((title) => ({ body: '', title })),
    skills: staticSkills,
  })

  console.log(`owner: @${owner.handle || '(no handle)'}`)
  console.log(`  about       ${content.about.length} chars`)
  console.log(`  highlights  ${content.highlights.length}: ${content.highlights.map((h) => h.title).join(' / ')}`)
  console.log(`  skills      ${content.skills.length}: ${content.skills.join(', ')}`)
  console.log(`  experience  ${content.experience.length}: ${content.experience.map((e) => e.title).join(' / ')}`)

  if (alreadyWritten && !force) {
    console.log('\nThis account already has profile content of its own. Refusing to overwrite it.')
    console.log('Re-run with --force only if replacing what they wrote is what you want.')
    return
  }

  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply.')
    return
  }

  await pool.query(
    `UPDATE visitor_users
     SET about = $1, highlights = $2::jsonb, skills = $3::jsonb, experience = $4::jsonb,
         updated_at = now()
     WHERE id = $5`,
    [
      content.about,
      JSON.stringify(content.highlights),
      JSON.stringify(content.skills),
      JSON.stringify(content.experience),
      owner.id,
    ],
  )
  console.log('\nWritten. content.js is untouched -- the English and Japanese text is still there.')
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
