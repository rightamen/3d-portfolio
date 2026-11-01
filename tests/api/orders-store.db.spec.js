import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

import { createOrdersStore } from '../../server/postgres/ordersStore.js'
import { ensureSchema } from '../../server/postgres/schema.js'
import { assertDisposableDatabaseUrl } from '../../scripts/lib/disposable-postgres.mjs'

const databaseUrl = process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl, 'Run npm run test:api:db with a disposable database')

let pool
let store
const creatorId = `order-review-creator-${randomUUID()}`
const buyerId = `order-review-buyer-${randomUUID()}`
const failureBuyerId = `order-review-failure-${randomUUID()}`
const failureNote = `reject-audit-${randomUUID()}`

test.beforeAll(async () => {
  assertDisposableDatabaseUrl(databaseUrl)
  pool = new pg.Pool({ connectionString: databaseUrl })
  await ensureSchema(pool)
  store = createOrdersStore({ pool })
  for (const id of [creatorId, buyerId, failureBuyerId]) {
    await pool.query(
      `INSERT INTO visitor_users (id, email, display_name, password_hash)
       VALUES ($1, $2, $1, 'test-only')`,
      [id, `${id}@example.test`],
    )
  }
  // Reject only this suite's sentinel values. This is fault injection into a
  // real PostgreSQL transaction, not a mock that assumes rollback works.
  await pool.query(`CREATE FUNCTION review_reject_order_event() RETURNS trigger AS $$
    BEGIN
      IF NEW.actor_id = '${failureBuyerId}' OR NEW.note = '${failureNote}' THEN
        RAISE EXCEPTION 'review audit write refused';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`)
  await pool.query(`CREATE TRIGGER review_order_event_failure
    BEFORE INSERT ON order_events FOR EACH ROW EXECUTE FUNCTION review_reject_order_event()`)
})

test.afterAll(async () => {
  await pool?.end()
})

const makeWork = async () => {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO works (id, creator_id, slug, title, status, price_cents)
     VALUES ($1, $2, $1, 'Review test work', 'published', 2500)`,
    [id, creatorId],
  )
  return id
}

const makeOrder = async () => {
  const result = await store.createOrder({ buyerId, workId: await makeWork() })
  return result.order
}

test('simultaneous purchases create exactly one pending order and one event', async () => {
  const workId = await makeWork()
  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.createOrder({ buyerId, workId })),
  )
  expect(new Set(results.map((result) => result.order.id)).size).toBe(1)
  expect(results.filter((result) => result.created)).toHaveLength(1)
  const rows = await pool.query('SELECT id FROM orders WHERE work_id = $1', [workId])
  expect(rows.rows).toHaveLength(1)
  expect(await store.listOrderEvents(rows.rows[0].id)).toHaveLength(1)
})

test('an audit failure rolls back order creation', async () => {
  const workId = await makeWork()
  await expect(store.createOrder({ buyerId: failureBuyerId, workId }))
    .rejects.toThrow('review audit write refused')
  expect((await pool.query('SELECT id FROM orders WHERE work_id = $1', [workId])).rows).toHaveLength(0)
})

test('an audit failure rolls back payment confirmation and entitlement', async () => {
  const order = await makeOrder()
  await expect(store.settleOrder(order.id, 'paid', { note: failureNote }))
    .rejects.toThrow('review audit write refused')
  expect((await store.getOrder(order.id)).status).toBe('pending')
  expect((await store.hasEntitlement(buyerId, order.workId)).entitled).toBe(false)
  expect(await store.listOrderEvents(order.id)).toHaveLength(1)
})

test('an audit failure rolls back the buyer payment note', async () => {
  const order = await makeOrder()
  await expect(store.setBuyerNote(order.id, buyerId, failureNote))
    .rejects.toThrow('review audit write refused')
  expect((await store.getOrder(order.id)).buyerNote).toBe('')
  expect(await store.listOrderEvents(order.id)).toHaveLength(1)
})

test('a buyer cancellation cannot overwrite receipt confirmed while it waits on a row lock', async () => {
  const order = await makeOrder()
  const creatorConnection = await pool.connect()
  let cancellation
  try {
    await creatorConnection.query('BEGIN')
    // Hold an uncommitted payment update. A plain SELECT can still see pending;
    // SELECT FOR UPDATE must wait, then recheck against the committed paid row.
    await creatorConnection.query("UPDATE orders SET status = 'paid' WHERE id = $1", [order.id])
    cancellation = store.settleOrder(order.id, 'cancelled', { actorId: buyerId, actorKind: 'buyer' })
    await expect.poll(async () => {
      const result = await pool.query(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND query LIKE '%orders%'`,
      )
      return result.rows[0].waiting
    }).toBeGreaterThan(0)
    await creatorConnection.query('COMMIT')
    expect((await cancellation).order).toBeNull()
    expect((await store.getOrder(order.id)).status).toBe('paid')
    expect((await store.listOrderEvents(order.id)).some((event) => event.event === 'settled:cancelled')).toBe(false)
  } finally {
    await creatorConnection.query('ROLLBACK')
    creatorConnection.release()
    await cancellation
  }
})

test('concurrent settlements keep the actual preceding status in their evidence', async () => {
  const order = await makeOrder()
  await Promise.all([
    store.settleOrder(order.id, 'paid'),
    store.settleOrder(order.id, 'refunded'),
  ])
  const events = await store.listOrderEvents(order.id)
  expect(events).toHaveLength(3)
  expect(events[1].fromStatus).toBe('pending')
  expect(events[2].fromStatus).toBe(events[1].toStatus)
  expect((await store.getOrder(order.id)).status).toBe(events[2].toStatus)
})

test('retrying a confirmation leaves one settlement event', async () => {
  const order = await makeOrder()
  const results = await Promise.all([
    store.settleOrder(order.id, 'paid'),
    store.settleOrder(order.id, 'paid'),
  ])
  expect(results.filter((result) => result.changed)).toHaveLength(1)
  expect(await store.listOrderEvents(order.id)).toHaveLength(2)
})
