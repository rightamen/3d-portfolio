import { platformFeeBasisPoints } from '../paymentInfo.js'
import { createId, toOrder, toOrderEvent } from './mappers.js'

// Orders and entitlement.
//
// Deliberately provider-agnostic. The first provider is `direct`: the buyer
// pays the CREATOR (an Alipay or WeChat code, a transfer) and the creator
// confirms receipt, because they are the only one who can see it arrive. The
// platform never touches the money, which is what keeps this buildable with no
// company and no payment licence -- see docs/adr/ADR_PLATFORM_PIVOT.md §6.
//
// The honest consequence: the platform is facilitating a transaction it cannot
// verify. It cannot force a refund, because it holds nothing to refund. What
// it CAN do is keep an unforgeable record of what everyone said and did, which
// is what order_events is for -- and that record is worth building now because
// it is the same record a platform-collecting provider would need later.
//
// The one rule that matters more than any of it: `hasEntitlement` is the only
// answer to "may this person have the file". Every download path asks it.

export const createOrdersStore = ({ pool }) => {
  const ordersStore = {
    // The question every download asks. A free work needs no order at all --
    // free is a price, and charging a buyer an order row for it would mean an
    // entitlement check that can fail for something nobody has to buy.
    hasEntitlement: async (userId, workId) => {
      const result = await pool.query(
        `SELECT
           works.price_cents,
           EXISTS (
             SELECT 1 FROM orders
             WHERE orders.work_id = works.id
               AND orders.buyer_id = $2
               AND orders.status = 'paid'
           ) AS bought,
           works.creator_id = $2 AS owns
         FROM works
         WHERE works.id = $1`,
        [workId, userId],
      )

      const row = result.rows[0]
      if (!row) return { entitled: false, reason: 'no-such-work' }
      // The creator of a work always has their own files. Making them buy
      // their own work back is the kind of rule that only ever surprises
      // someone at the worst moment.
      if (row.owns) return { entitled: true, reason: 'creator' }
      if (Number(row.price_cents) === 0) return { entitled: true, reason: 'free' }
      if (row.bought) return { entitled: true, reason: 'purchased' }

      return { entitled: false, reason: 'unpaid' }
    },

    getOrder: async (id) => {
      const result = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.id = $1`,
        [id],
      )
      return toOrder(result.rows[0])
    },

    // An open order for this buyer and work, if there is one. Clicking buy
    // twice should land on the same order and the same instructions, not mint
    // a second one the operator then has to reconcile.
    findOpenOrder: async (buyerId, workId) => {
      const result = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.buyer_id = $1 AND orders.work_id = $2
           AND orders.status IN ('pending', 'paid')
         ORDER BY CASE WHEN orders.status = 'paid' THEN 0 ELSE 1 END, orders.created_at DESC
         LIMIT 1`,
        [buyerId, workId],
      )
      return toOrder(result.rows[0])
    },

    // The amount is read from the work here rather than taken from the caller.
    // A price that arrives in a request body is a price the buyer chose.
    //
    // The fee is forced to zero for `direct`, not merely defaulted: the
    // platform cannot take a share of money that never passes through it, and
    // an order claiming otherwise would be a number nobody can collect.
    createOrder: async ({ buyerId, feeBasisPoints = 0, paymentSnapshot, provider = 'direct', workId }) => {
      const id = createId()
      const fee = platformFeeBasisPoints(provider, feeBasisPoints)

      const result = await pool.query(
        `INSERT INTO orders (id, buyer_id, work_id, creator_id, amount_cents,
                             platform_fee_cents, currency, provider, provider_reference,
                             payment_snapshot)
         SELECT $1, $2, works.id, works.creator_id, works.price_cents,
                (works.price_cents * $4) / 10000, works.currency, $5, $1, $6
         FROM works
         WHERE works.id = $3 AND works.status = 'published' AND works.price_cents > 0
         RETURNING id`,
        [id, buyerId, workId, fee, provider, JSON.stringify(paymentSnapshot || { methods: [] })],
      )

      if (!result.rows[0]) return null

      await ordersStore.recordEvent(id, {
        actorId: buyerId,
        actorKind: 'buyer',
        event: 'placed',
        toStatus: 'pending',
      })

      return ordersStore.getOrder(id)
    },

    // Append-only. There is deliberately no update or delete for these: a
    // record that can be rewritten is not a record, and this one exists to be
    // read back during an argument.
    recordEvent: async (orderId, { actorId = null, actorKind, event, fromStatus = null, note = null, toStatus = null }) => {
      await pool.query(
        `INSERT INTO order_events (id, order_id, actor_kind, actor_id, event, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [createId(), orderId, actorKind, actorId, event, fromStatus, toStatus, note],
      )
    },

    listOrderEvents: async (orderId) => {
      const result = await pool.query(
        `SELECT order_events.*, visitor_users.display_name AS actor_name
         FROM order_events
         LEFT JOIN visitor_users ON visitor_users.id = order_events.actor_id
         WHERE order_id = $1
         ORDER BY created_at ASC`,
        [orderId],
      )
      return result.rows.map(toOrderEvent)
    },

    listOrdersForBuyer: async (buyerId, { limit = 50, offset = 0 } = {}) => {
      const total = await pool.query(
        'SELECT count(*)::int AS count FROM orders WHERE buyer_id = $1',
        [buyerId],
      )
      const rows = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.buyer_id = $1
         ORDER BY orders.created_at DESC
         LIMIT $2 OFFSET $3`,
        [buyerId, limit, offset],
      )
      return { items: rows.rows.map(toOrder), total: total.rows[0].count }
    },

    listOrdersForAdmin: async ({ limit = 20, offset = 0, status = '' } = {}) => {
      const conditions = []
      const params = []
      if (status) {
        params.push(status)
        conditions.push(`orders.status = $${params.length}`)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const total = await pool.query(`SELECT count(*)::int AS count FROM orders ${where}`, params)
      const rows = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         ${where}
         ORDER BY CASE WHEN orders.status = 'pending' THEN 0 ELSE 1 END,
                  orders.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      )
      return { items: rows.rows.map(toOrder), total: total.rows[0].count }
    },

    // What the buyer says they paid with. Recorded on the order rather than
    // mailed anywhere, so the operator confirming it is looking at the buyer's
    // own words next to the amount.
    setBuyerNote: async (orderId, buyerId, note) => {
      const result = await pool.query(
        `UPDATE orders SET buyer_note = $3, updated_at = now()
         WHERE id = $1 AND buyer_id = $2 AND status = 'pending'
         RETURNING id`,
        [orderId, buyerId, note],
      )
      if (!result.rows[0]) return false

      // The claim itself is evidence, and so is when it was made. A buyer who
      // edits their note later leaves both versions in the log.
      await ordersStore.recordEvent(orderId, {
        actorId: buyerId,
        actorKind: 'buyer',
        event: 'claimed-payment',
        note,
      })

      return true
    },

    // The order a creator may act on: their own sale, loaded with the check
    // built in rather than left to the caller to remember.
    getSaleForCreator: async (orderId, creatorId) => {
      const result = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.id = $1 AND orders.creator_id = $2`,
        [orderId, creatorId],
      )
      return toOrder(result.rows[0])
    },

    // Orders sitting unconfirmed. This is the leverage a platform that does
    // not hold the money still has: a creator who takes payments and never
    // confirms them is visible, and visibly so to an operator.
    listStaleOrders: async ({ olderThanMs = 48 * 3600 * 1000 } = {}) => {
      const result = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.status = 'pending'
           AND orders.buyer_note IS NOT NULL
           AND orders.updated_at < now() - ($1::bigint * interval '1 millisecond')
         ORDER BY orders.updated_at ASC
         LIMIT 100`,
        [olderThanMs],
      )
      return result.rows.map(toOrder)
    },

    /**
     * Marks an order paid, or refunded, or cancelled.
     *
     * Returns { order } on success, or { conflict: 'already-owned' } when the
     * buyer already has a paid order for this work -- the partial unique index
     * is what actually enforces that, and catching its violation here is what
     * turns a 500 into an answer the console can show.
     */
    settleOrder: async (orderId, status, { actorId = null, actorKind = 'admin', note = null, settledBy = null } = {}) => {
      const before = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])
      if (!before.rows[0]) return { order: null }
      const fromStatus = before.rows[0].status

      try {
        const result = await pool.query(
          `UPDATE orders
           SET status = $2,
               settled_note = COALESCE($3, settled_note),
               settled_by = COALESCE($4, settled_by),
               purchased_at = CASE WHEN $2 = 'paid' THEN COALESCE(purchased_at, now())
                                   ELSE purchased_at END,
               refunded_at = CASE WHEN $2 = 'refunded' THEN now() ELSE refunded_at END,
               updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [orderId, status, note, settledBy],
        )
        if (!result.rows[0]) return { order: null }

        await ordersStore.recordEvent(orderId, {
          actorId,
          actorKind,
          event: `settled:${status}`,
          fromStatus,
          note,
          toStatus: status,
        })

        return { order: await ordersStore.getOrder(orderId) }
      } catch (error) {
        // 23505 is unique_violation: orders_paid_entitlement_unique_idx.
        if (error.code === '23505') return { conflict: 'already-owned' }
        throw error
      }
    },

    // EVERY order, not only the paid ones. The creator confirming receipt is
    // the payment system here, so a list that hides pending orders hides the
    // one thing they have to act on -- and the confirm button would never
    // render. Pending first, for the same reason.
    //
    // The money totals still count only paid orders: an order nobody has
    // confirmed is not revenue.
    creatorSales: async (creatorId, { limit = 50, offset = 0 } = {}) => {
      const total = await pool.query(
        'SELECT count(*)::int AS count FROM orders WHERE creator_id = $1',
        [creatorId],
      )
      const rows = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.creator_id = $1
         ORDER BY CASE WHEN orders.status = 'pending' THEN 0 ELSE 1 END,
                  orders.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [creatorId, limit, offset],
      )

      const earned = await pool.query(
        `SELECT COALESCE(sum(amount_cents - platform_fee_cents), 0)::bigint AS net,
                COALESCE(sum(amount_cents), 0)::bigint AS gross
         FROM orders WHERE creator_id = $1 AND status = 'paid'`,
        [creatorId],
      )

      return {
        items: rows.rows.map(toOrder),
        netCents: Number(earned.rows[0].net),
        grossCents: Number(earned.rows[0].gross),
        total: total.rows[0].count,
      }
    },
  }

  return ordersStore
}
