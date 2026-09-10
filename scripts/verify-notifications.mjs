#!/usr/bin/env node
// Proves the notification store does what the bell and the console assume.
//
// The rules being checked are the ones that are invisible when they break: an
// announcement that stays unread for a person who read it, a count that
// disagrees with the list, an unpublish that leaves the announcement in
// everybody's inbox, a delete that works on somebody else's notice.
//
// Read-only with respect to anything real: it initdb's a throwaway cluster in a
// temp directory, destroys it at the end, and never reads DATABASE_URL.
//
//   node scripts/verify-notifications.mjs
import process from 'node:process'

import pg from 'pg'

import { createNotificationsStore } from '../server/postgres/notificationsStore.js'
import { ensureSchema } from '../server/postgres/schema.js'
import { startDisposablePostgres } from './lib/disposable-postgres.mjs'

const log = (message) => console.log(`[notify] ${message}`)

let failures = 0
const check = (name, condition) => {
  if (condition) log(`ok    ${name}`)
  else {
    failures += 1
    log(`FAIL  ${name}`)
  }
}

const cluster = await startDisposablePostgres({ databaseName: 'mrright_notifications_test' })
const pool = new pg.Pool({ connectionString: cluster.databaseUrl })

try {
  await ensureSchema(pool)
  const store = createNotificationsStore({ pool })

  // Two accounts, because most of what can go wrong here is one person seeing
  // another person's things.
  const makeUser = async (id, email) => {
    await pool.query(
      `INSERT INTO visitor_users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, 'x')`,
      [id, email, id],
    )
    return id
  }
  const alice = await makeUser('user-alice', 'alice@example.test')
  const bob = await makeUser('user-bob', 'bob@example.test')

  // ── Personal notifications ───────────────────────────────────────────────

  await store.notify({ kind: 'order:placed', link: '/account/selling', title: 'A work', userId: alice })
  check('a notification reaches the person it names', (await store.countUnread(alice)) === 1)
  check('and nobody else', (await store.countUnread(bob)) === 0)

  // The rule that keeps a courtesy from breaking the thing it reports.
  const bad = await store.notify({ kind: 'order:placed', title: 'x', userId: 'nobody-at-all' })
  check('an undeliverable notification returns null rather than throwing', bad === null)

  // ── Announcements ────────────────────────────────────────────────────────

  const draft = await store.createAnnouncement({ title: 'Draft only' })
  check('a draft is invisible to everyone', (await store.countUnread(alice)) === 1)

  const live = await store.createAnnouncement({ published: true, title: 'Everybody' })
  check('a published announcement reaches everyone', (await store.countUnread(alice)) === 2)
  check('including someone with no notifications of their own', (await store.countUnread(bob)) === 1)

  // ── Reading ──────────────────────────────────────────────────────────────

  await store.markAllRead(alice)
  check('marking read clears the count', (await store.countUnread(alice)) === 0)
  check('and only for the person who read them', (await store.countUnread(bob)) === 1)

  // Two tabs opening the bell at once must not fail on the read row.
  await store.markAllRead(alice)
  check('marking read twice is not an error', (await store.countUnread(alice)) === 0)

  const inbox = await store.listInbox(alice)
  check('the list and the count agree', inbox.unread === (await store.countUnread(alice)))
  check('the list holds both kinds', inbox.items.length === 2)
  check(
    'newest first',
    inbox.items.every((item, index) =>
      index === 0 ? true : inbox.items[index - 1].createdAt >= item.createdAt,
    ),
  )

  // ── Unpublishing ─────────────────────────────────────────────────────────

  await store.updateAnnouncement(live.id, { published: false })
  const afterUnpublish = await store.listInbox(bob)
  check(
    'unpublishing removes it from every inbox',
    afterUnpublish.items.every((item) => item.id !== live.id),
  )
  check('and from the count', (await store.countUnread(bob)) === 0)

  const withDrafts = await store.listAnnouncements({ includeDrafts: true })
  check('the console still sees drafts', withDrafts.some((item) => item.id === draft.id))
  const published = await store.listAnnouncements()
  check('the public list does not', published.every((item) => item.id !== draft.id))

  // ── Creator notices ──────────────────────────────────────────────────────

  const notice = await store.createCreatorNotice(alice, 'Commissions open.')
  check('a notice belongs to its creator', (await store.listCreatorNotices(alice)).length === 1)
  check('and shows on nobody else', (await store.listCreatorNotices(bob)).length === 0)

  // ⚠️ The one that matters: knowing an id must not be enough to delete it.
  check('another account cannot delete it', (await store.deleteCreatorNotice(bob, notice.id)) === false)
  check('it is still there', (await store.listCreatorNotices(alice)).length === 1)
  check('its owner can', (await store.deleteCreatorNotice(alice, notice.id)) === true)
  check('and then it is gone', (await store.listCreatorNotices(alice)).length === 0)
} finally {
  await pool.end()
  cluster.teardown()
  log('Disposable cluster destroyed.')
}

console.log('')
if (failures > 0) {
  log(`${failures} check(s) failed.`)
  process.exitCode = 1
} else {
  log('Notifications behave as the bell and the console assume.')
}
