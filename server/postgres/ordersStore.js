import { createId, toOrder } from './mappers.js'

// Orders and entitlement.
//
// Deliberately provider-agnostic. The first provider is `manual` -- the buyer
// pays by whatever the creator arranged (an Alipay or WeChat code, a transfer)
// and an operator confirms it. That is not a placeholder: it is how a creator
// without a company actually sells things, and it exercises the entire path
// from "wants it" to "may download it". A card provider later is an adapter,
// not a rewrite, because nothing below knows what a card is.
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
    createOrder: async ({ buyerId, feeBasisPoints = 0, provider = 'manual', workId }) => {
      const id = createId()
      const result = await pool.query(
        `INSERT INTO orders (id, buyer_id, work_id, creator_id, amount_cents,
                             platform_fee_cents, currency, provider, provider_reference)
         SELECT $1, $2, works.id, works.creator_id, works.price_cents,
                (works.price_cents * $4) / 10000, works.currency, $5, $1
         FROM works
         WHERE works.id = $3 AND works.status = 'published' AND works.price_cents > 0
         RETURNING id`,
        [id, buyerId, workId, feeBasisPoints, provider],
      )

      if (!result.rows[0]) return null
      return ordersStore.getOrder(id)
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
      return Boolean(result.rows[0])
    },

    /**
     * Marks an order paid, or refunded, or cancelled.
     *
     * Returns { order } on success, or { conflict: 'already-owned' } when the
     * buyer already has a paid order for this work -- the partial unique index
     * is what actually enforces that, and catching its violation here is what
     * turns a 500 into an answer the console can show.
     */
    settleOrder: async (orderId, status, { note = null, settledBy = null } = {}) => {
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
        return { order: await ordersStore.getOrder(orderId) }
      } catch (error) {
        // 23505 is unique_violation: orders_paid_entitlement_unique_idx.
        if (error.code === '23505') return { conflict: 'already-owned' }
        throw error
      }
    },

    creatorSales: async (creatorId, { limit = 50, offset = 0 } = {}) => {
      const total = await pool.query(
        `SELECT count(*)::int AS count FROM orders WHERE creator_id = $1 AND status = 'paid'`,
        [creatorId],
      )
      const rows = await pool.query(
        `SELECT orders.*, works.slug AS work_slug, works.title AS work_title,
                visitor_users.handle AS creator_handle
         FROM orders
         JOIN works ON works.id = orders.work_id
         JOIN visitor_users ON visitor_users.id = orders.creator_id
         WHERE orders.creator_id = $1 AND orders.status = 'paid'
         ORDER BY orders.purchased_at DESC
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
