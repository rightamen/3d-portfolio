import { toWorkSummary, workColumns } from './mappers.js'

// Private creator metrics and account bookmarks. Never accepts a caller-supplied
// creator/user id from HTTP; routes bind these methods to the authenticated user.
const metricColumns = `
  (SELECT count(*)::int FROM work_favorites f WHERE f.work_id=works.id) AS favorite_count,
  (SELECT count(*)::int FROM work_likes l WHERE l.work_id=works.id) AS like_count,
  (SELECT count(*)::int FROM work_comments c WHERE c.work_id=works.id AND c.status='published') AS comment_count,
  (SELECT count(*)::int FROM download_events d WHERE d.project_slug='work:' || works.id) AS download_count,
  (SELECT count(*)::int FROM orders o WHERE o.work_id=works.id AND o.creator_id=$1 AND o.status='paid') AS paid_order_count
`
const numberFields = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,Number(value || 0)]))

export const createCreatorStore = ({ pool }) => ({
  getFavorite: async (workId, userId) => {
    const result = await pool.query('SELECT 1 FROM work_favorites WHERE work_id=$1 AND user_id=$2', [workId,userId])
    return Boolean(result.rowCount)
  },
  saveFavorite: async (workId, userId) => {
    // Explicit desired state is idempotent under retries and concurrent clicks.
    const result = await pool.query(`INSERT INTO work_favorites(work_id,user_id)
      SELECT id,$2 FROM works WHERE id=$1 AND status='published'
      ON CONFLICT(work_id,user_id) DO UPDATE SET user_id=EXCLUDED.user_id
      RETURNING work_id`, [workId,userId])
    return Boolean(result.rowCount)
  },
  removeFavorite: async (workId, userId) => {
    await pool.query('DELETE FROM work_favorites WHERE work_id=$1 AND user_id=$2', [workId,userId])
  },
  listFavorites: async (userId, {limit=24,offset=0,collectionId=null}={}) => {
    const total = await pool.query('SELECT count(*)::int AS count FROM work_favorites f WHERE user_id=$1 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM favorite_collection_items i WHERE i.user_id=f.user_id AND i.work_id=f.work_id AND i.collection_id=$2))', [userId,collectionId])
    const result = await pool.query(`SELECT ${workColumns}, f.work_id AS favorite_work_id, f.created_at AS saved_at
      FROM work_favorites f
      LEFT JOIN works ON works.id=f.work_id AND works.status='published'
      LEFT JOIN visitor_users ON visitor_users.id=works.creator_id
      WHERE f.user_id=$1 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM favorite_collection_items i WHERE i.user_id=f.user_id AND i.work_id=f.work_id AND i.collection_id=$2)) ORDER BY f.created_at DESC, f.work_id ASC LIMIT $3 OFFSET $4`, [userId,collectionId,limit,offset])
    return {total:total.rows[0].count,items:result.rows.map(row=>({
      workId:row.favorite_work_id, savedAt:row.saved_at.toISOString(), available:Boolean(row.id),
      work:row.id ? toWorkSummary(row) : null,
    }))}
  },
  getCreatorAnalytics: async (creatorId, {days=30,limit=20,offset=0}={}) => {
    const metrics = `WITH metrics AS (SELECT ${workColumns}, ${metricColumns}
      FROM works JOIN visitor_users ON visitor_users.id=works.creator_id WHERE works.creator_id=$1)`
    const [totals, works, sales, revenue, series] = await Promise.all([
      pool.query(`${metrics} SELECT count(*)::int AS works,
        count(*) FILTER(WHERE status='published')::int AS published,
        count(*) FILTER(WHERE status='draft')::int AS drafts,
        count(*) FILTER(WHERE status='review')::int AS review,
        count(*) FILTER(WHERE status IN ('hidden','rejected'))::int AS offline,
        COALESCE(sum(favorite_count),0) AS favorites, COALESCE(sum(like_count),0) AS likes,
        COALESCE(sum(comment_count),0) AS comments, COALESCE(sum(download_count),0) AS downloads,
        COALESCE(sum((rating_summary->>'count')::int),0) AS ratings,
        COALESCE(sum((rating_summary->>'recommendations')::int),0) AS recommendations
        FROM metrics`, [creatorId]),
      pool.query(`${metrics} SELECT * FROM metrics ORDER BY favorite_count DESC, download_count DESC, id ASC
        LIMIT $2 OFFSET $3`, [creatorId,limit,offset]),
      pool.query(`SELECT count(*)::int AS orders, count(*) FILTER(WHERE status='paid')::int AS paid,
        count(*) FILTER(WHERE status='pending')::int AS pending FROM orders WHERE creator_id=$1`, [creatorId]),
      pool.query(`SELECT lower(currency) AS currency, sum(amount_cents)::text AS amount
        FROM orders WHERE creator_id=$1 AND status='paid' GROUP BY lower(currency) ORDER BY lower(currency)`, [creatorId]),
      pool.query(`WITH days AS (
        SELECT generate_series((now() AT TIME ZONE 'UTC')::date - ($2::int-1),
          (now() AT TIME ZONE 'UTC')::date, interval '1 day')::date AS day
      ), order_days AS (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS count
        FROM orders WHERE creator_id=$1 AND created_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int-1))::timestamp AT TIME ZONE 'UTC')
        GROUP BY 1
      ), download_days AS (
        SELECT (d.created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS count
        FROM download_events d JOIN works w ON d.project_slug='work:' || w.id
        WHERE w.creator_id=$1 AND d.created_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int-1))::timestamp AT TIME ZONE 'UTC')
        GROUP BY 1
      ) SELECT to_char(days.day,'YYYY-MM-DD') AS date, COALESCE(o.count,0) AS orders,
        COALESCE(d.count,0) AS downloads FROM days LEFT JOIN order_days o USING(day)
        LEFT JOIN download_days d USING(day) ORDER BY days.day`, [creatorId,days]),
    ])
    return {
      generatedAt:new Date().toISOString(), timeZone:'UTC', days,
      totals:{...numberFields(totals.rows[0]),...numberFields(sales.rows[0])},
      revenue:revenue.rows.map(row=>({currency:row.currency,amountCents:Number(row.amount)})),
      series:series.rows,
      works:works.rows.map(row=>({...toWorkSummary(row),metrics:{
        favorites:row.favorite_count,likes:row.like_count,comments:row.comment_count,
        downloads:row.download_count,paid:row.paid_order_count,
      }})),
      total:totals.rows[0].works,
    }
  },
})
