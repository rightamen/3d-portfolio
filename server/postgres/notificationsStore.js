import { createId } from './mappers.js'

// Notifications, in three kinds that share a bell and nothing else.
//
//   announcements    an operator publishes once, everyone reads
//   notifications    the platform tells one person something happened
//   creator_notices  a creator posts to whoever visits their profile
//
// The second one is the one the marketplace was missing. A creator had no way
// to learn a stranger had ordered their work -- they had to go and look at the
// orders page on the off-chance. A sale that nobody is told about is a sale the
// site quietly loses.

const toAnnouncement = (row) =>
  row
    ? {
        body: row.body || '',
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        id: row.id,
        link: row.link || '',
        published: Boolean(row.published_at),
        publishedAt: row.published_at?.toISOString?.() || row.published_at || null,
        title: row.title,
      }
    : null

const toNotification = (row) =>
  row
    ? {
        body: row.body || '',
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        id: row.id,
        kind: row.kind,
        link: row.link || '',
        read: Boolean(row.read_at),
        title: row.title,
      }
    : null

const toCreatorNotice = (row) =>
  row
    ? {
        body: row.body,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        id: row.id,
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
      }
    : null

export const createNotificationsStore = ({ pool }) => {
  const store = {
    // ── The platform telling one person something ──────────────────────────

    // Soft-fails on purpose. A notification is a courtesy attached to an action
    // that already succeeded: an order was placed, a work was approved. Letting
    // a failure here roll back the thing it is reporting would be the tail
    // wagging the dog, so it is logged and swallowed.
    notify: async ({ body = '', kind, link = '', title, userId }) => {
      if (!userId || !kind || !title) return null

      try {
        const result = await pool.query(
          `INSERT INTO notifications (id, user_id, kind, title, body, link)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [createId(), userId, kind, title, body, link],
        )
        return toNotification(result.rows[0])
      } catch (error) {
        console.error('Notification not delivered:', error.message)
        return null
      }
    },

    // ── The inbox: personal notifications and announcements, merged ─────────

    // One query per table rather than a UNION: they have different columns and
    // different read semantics, and a UNION would need both padded with NULLs
    // to line up. Merging two small sorted lists in JS is cheaper to read and
    // costs nothing at this size.
    listInbox: async (userId, { limit = 30 } = {}) => {
      const [personal, announced] = await Promise.all([
        pool.query(
          `SELECT * FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, limit],
        ),
        pool.query(
          `SELECT announcements.*, announcement_reads.read_at
           FROM announcements
           LEFT JOIN announcement_reads
             ON announcement_reads.announcement_id = announcements.id
            AND announcement_reads.user_id = $1
           WHERE announcements.published_at IS NOT NULL
           ORDER BY announcements.published_at DESC
           LIMIT $2`,
          [userId, limit],
        ),
      ])

      const items = [
        ...personal.rows.map((row) => ({ ...toNotification(row), source: 'notification' })),
        ...announced.rows.map((row) => ({
          ...toAnnouncement(row),
          kind: 'announcement',
          read: Boolean(row.read_at),
          source: 'announcement',
        })),
      ]

      items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

      return {
        items: items.slice(0, limit),
        unread: items.filter((item) => !item.read).length,
      }
    },

    // The bell asks for this on every page, so it is two counts and nothing
    // else -- never the rows.
    countUnread: async (userId) => {
      const result = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM notifications
             WHERE user_id = $1 AND read_at IS NULL) AS personal,
           (SELECT count(*)::int FROM announcements
             WHERE published_at IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM announcement_reads
                 WHERE announcement_reads.announcement_id = announcements.id
                   AND announcement_reads.user_id = $1
               )) AS announced`,
        [userId],
      )
      const row = result.rows[0] || {}
      return Number(row.personal || 0) + Number(row.announced || 0)
    },

    // Marking everything read is one action, because that is how people use a
    // bell: they open it, they have seen it, it stops nagging. Per-item read
    // state exists in the tables and can be surfaced later if it earns its way.
    markAllRead: async (userId) => {
      await pool.query(
        `UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      )
      // ON CONFLICT DO NOTHING: two tabs opening the bell at once is normal,
      // and the second one must not fail.
      await pool.query(
        `INSERT INTO announcement_reads (announcement_id, user_id)
         SELECT announcements.id, $1
         FROM announcements
         WHERE announcements.published_at IS NOT NULL
         ON CONFLICT (announcement_id, user_id) DO NOTHING`,
        [userId],
      )
      return true
    },

    // ── Announcements, for the operator ────────────────────────────────────

    listAnnouncements: async ({ includeDrafts = false, limit = 50 } = {}) => {
      const result = await pool.query(
        `SELECT * FROM announcements
         ${includeDrafts ? '' : 'WHERE published_at IS NOT NULL'}
         ORDER BY coalesce(published_at, created_at) DESC
         LIMIT $1`,
        [limit],
      )
      return result.rows.map(toAnnouncement)
    },

    createAnnouncement: async ({ body = '', createdBy = null, link = '', published = false, title }) => {
      const result = await pool.query(
        `INSERT INTO announcements (id, title, body, link, published_at, created_by)
         VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() ELSE NULL END, $6)
         RETURNING *`,
        [createId(), title, body, link, published, createdBy],
      )
      return toAnnouncement(result.rows[0])
    },

    updateAnnouncement: async (id, { body, link, published, title }) => {
      const result = await pool.query(
        `UPDATE announcements
         SET title = coalesce($2, title),
             body = coalesce($3, body),
             link = coalesce($4, link),
             -- Publishing stamps the time; unpublishing clears it and the
             -- announcement disappears from every inbox, which is the point of
             -- being able to unpublish at all.
             published_at = CASE
               WHEN $5 IS NULL THEN published_at
               WHEN $5 THEN coalesce(published_at, now())
               ELSE NULL
             END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, title ?? null, body ?? null, link ?? null, published ?? null],
      )
      return toAnnouncement(result.rows[0])
    },

    deleteAnnouncement: async (id) => {
      const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [id])
      return Boolean(result.rows[0])
    },

    // ── Creator notices: public content on a profile ───────────────────────

    listCreatorNotices: async (creatorId, { limit = 20 } = {}) => {
      const result = await pool.query(
        `SELECT * FROM creator_notices
         WHERE creator_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [creatorId, limit],
      )
      return result.rows.map(toCreatorNotice)
    },

    createCreatorNotice: async (creatorId, body) => {
      const result = await pool.query(
        `INSERT INTO creator_notices (id, creator_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [createId(), creatorId, body],
      )
      return toCreatorNotice(result.rows[0])
    },

    // creator_id is in the WHERE, not just the id: without it, knowing an id
    // would be enough to delete somebody else's notice.
    deleteCreatorNotice: async (creatorId, id) => {
      const result = await pool.query(
        'DELETE FROM creator_notices WHERE id = $1 AND creator_id = $2 RETURNING id',
        [id, creatorId],
      )
      return Boolean(result.rows[0])
    },
  }

  return store
}

export default { createNotificationsStore }
