import { createId, toWork, toWorkAsset, toWorkSummary, workColumns } from './mappers.js'

// Works: the marketplace catalogue. See docs/adr/ADR_PLATFORM_PIVOT.md.
//
// The lifecycle is draft -> review -> published, with hidden and rejected as
// the two ways out. Only `published` is ever visible to someone who is not the
// owner or an admin, and that rule lives in the SQL here rather than in the
// route handlers: a new endpoint that forgets the filter would otherwise leak
// every draft on the site.

const EDITABLE_COLUMNS = [
  'title',
  'title_zh',
  'title_en',
  'title_ja',
  'summary',
  'summary_zh',
  'summary_en',
  'summary_ja',
  'workflow',
  'workflow_zh',
  'workflow_en',
  'workflow_ja',
  'format',
  'format_zh',
  'format_en',
  'format_ja',
  'model_size',
  'model_size_zh',
  'model_size_en',
  'model_size_ja',
  'download_policy',
  'download_policy_zh',
  'download_policy_en',
  'download_policy_ja',
  'year',
  'asset_category',
  'image',
  'model_url',
  'license',
  'currency',
]

const JSON_COLUMNS = ['stack', 'viewer_features', 'tags']

export const createWorksStore = ({ pool }) => {
  const loadAssets = async (workId) => {
    const result = await pool.query(
      `SELECT * FROM work_assets WHERE work_id = $1 ORDER BY kind, sort_order, created_at`,
      [workId],
    )
    return result.rows
  }

  const worksStore = {
    // Public browse. Published only, newest first. The filters are all
    // optional and all parameterised -- `query` reaches SQL as a bound value,
    // never as interpolated text.
    listPublishedWorks: async ({
      category = '',
      creatorHandle = '',
      limit = 24,
      offset = 0,
      query = '',
    } = {}) => {
      const conditions = [`works.status = 'published'`]
      const params = []

      if (creatorHandle) {
        params.push(creatorHandle.toLowerCase())
        conditions.push(`lower(visitor_users.handle) = $${params.length}`)
      }
      if (category) {
        params.push(category)
        conditions.push(`works.asset_category = $${params.length}`)
      }
      if (query) {
        params.push(`%${query}%`)
        conditions.push(
          `(works.title ILIKE $${params.length} OR works.summary ILIKE $${params.length}
            OR works.title_zh ILIKE $${params.length} OR works.title_ja ILIKE $${params.length})`,
        )
      }

      const where = conditions.join(' AND ')
      const total = await pool.query(
        `SELECT count(*)::int AS count FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         WHERE ${where}`,
        params,
      )

      const rows = await pool.query(
        `SELECT ${workColumns} FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         WHERE ${where}
         ORDER BY works.published_at DESC NULLS LAST, works.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      )

      return { items: rows.rows.map(toWorkSummary), total: total.rows[0].count }
    },

    // One work by its public address. `viewerId` is the caller, so the owner
    // can preview their own draft at its real URL instead of having to publish
    // it to see what it looks like; everyone else gets 'published' or nothing.
    getWorkByHandleAndSlug: async (handle, slug, { isAdmin = false, viewerId = null } = {}) => {
      const result = await pool.query(
        `SELECT ${workColumns} FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         WHERE lower(visitor_users.handle) = lower($1) AND lower(works.slug) = lower($2)`,
        [String(handle).replace(/^@/, ''), slug],
      )

      const row = result.rows[0]
      if (!row) return null

      const isOwner = Boolean(viewerId) && row.creator_id === viewerId
      if (row.status !== 'published' && !isOwner && !isAdmin) return null

      return toWork(row, {
        assets: await loadAssets(row.id),
        // The source archive's URL is only ever handed to the person who owns
        // the work. A buyer reaches it through a download ticket, which is a
        // separate path with an expiry and an audit trail.
        includeProtected: isOwner || isAdmin,
      })
    },

    getWorkById: async (id, { includeProtected = false } = {}) => {
      const result = await pool.query(
        `SELECT ${workColumns} FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         WHERE works.id = $1`,
        [id],
      )
      const row = result.rows[0]
      if (!row) return null
      return toWork(row, { assets: await loadAssets(row.id), includeProtected })
    },

    // Everything the caller owns, whatever its status. This is the one list
    // that deliberately shows drafts, so it takes the owner id as a bound
    // parameter and has no "all users" mode at all.
    listWorksByCreator: async (creatorId, { limit = 50, offset = 0 } = {}) => {
      const total = await pool.query(
        'SELECT count(*)::int AS count FROM works WHERE creator_id = $1',
        [creatorId],
      )
      const rows = await pool.query(
        `SELECT ${workColumns} FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         WHERE works.creator_id = $1
         ORDER BY works.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [creatorId, limit, offset],
      )
      return { items: rows.rows.map(toWorkSummary), total: total.rows[0].count }
    },

    // Admin moderation queue. Defaults to the works actually waiting on a
    // decision, because that is the question the console is usually asking.
    listWorksForAdmin: async ({ limit = 20, offset = 0, status = '' } = {}) => {
      const conditions = []
      const params = []
      if (status) {
        params.push(status)
        conditions.push(`works.status = $${params.length}`)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const total = await pool.query(
        `SELECT count(*)::int AS count FROM works ${where}`,
        params,
      )
      const rows = await pool.query(
        `SELECT ${workColumns} FROM works
         JOIN visitor_users ON visitor_users.id = works.creator_id
         ${where}
         ORDER BY works.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      )
      return { items: rows.rows.map(toWorkSummary), total: total.rows[0].count }
    },

    // "Anyone can publish" (ADR §1), so becoming a creator is not an
    // application anybody has to approve -- it is what happens the first time
    // you make a work. The handle is the only prerequisite, because it is half
    // of every work's URL, and the caller checks for it before getting here.
    //
    // It lives in this store rather than authStore because creator_enabled_at
    // means something to the marketplace and nothing to signing in.
    ensureCreatorEnabled: async (userId) => {
      await pool.query(
        `UPDATE visitor_users
         SET creator_enabled_at = COALESCE(creator_enabled_at, now()), updated_at = now()
         WHERE id = $1 AND handle IS NOT NULL AND handle <> ''`,
        [userId],
      )
    },

    slugTaken: async (creatorId, slug, { exceptId = null } = {}) => {
      const result = await pool.query(
        `SELECT id FROM works
         WHERE creator_id = $1 AND lower(slug) = lower($2) AND ($3::text IS NULL OR id <> $3)`,
        [creatorId, slug, exceptId],
      )
      return Boolean(result.rows[0])
    },

    createWork: async (creatorId, fields) => {
      const id = createId()
      const columns = ['id', 'creator_id', 'slug', 'price_cents']
      const values = [id, creatorId, fields.slug, fields.priceCents ?? 0]

      for (const column of EDITABLE_COLUMNS) {
        if (fields[column] === undefined) continue
        columns.push(column)
        values.push(fields[column])
      }
      for (const column of JSON_COLUMNS) {
        if (fields[column] === undefined) continue
        columns.push(column)
        values.push(JSON.stringify(fields[column]))
      }

      await pool.query(
        `INSERT INTO works (${columns.join(', ')})
         VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`,
        values,
      )

      return worksStore.getWorkById(id, { includeProtected: true })
    },

    // Partial update: only the keys the caller sent are written, so a client
    // that knows about fewer fields than the server cannot blank the rest.
    // The project-editing endpoint next door replaces the whole payload and
    // has silently cleared columns because of it -- not repeating that here.
    updateWork: async (id, fields) => {
      const assignments = []
      const values = [id]

      for (const column of EDITABLE_COLUMNS) {
        if (fields[column] === undefined) continue
        values.push(fields[column])
        assignments.push(`${column} = $${values.length}`)
      }
      for (const column of JSON_COLUMNS) {
        if (fields[column] === undefined) continue
        values.push(JSON.stringify(fields[column]))
        assignments.push(`${column} = $${values.length}`)
      }
      if (fields.slug !== undefined) {
        values.push(fields.slug)
        assignments.push(`slug = $${values.length}`)
      }
      if (fields.priceCents !== undefined) {
        values.push(fields.priceCents)
        assignments.push(`price_cents = $${values.length}`)
      }

      if (!assignments.length) return worksStore.getWorkById(id, { includeProtected: true })

      const result = await pool.query(
        `UPDATE works SET ${assignments.join(', ')}, updated_at = now()
         WHERE id = $1 RETURNING id`,
        values,
      )
      if (!result.rows[0]) return null

      return worksStore.getWorkById(id, { includeProtected: true })
    },

    // published_at is stamped once, the first time a work goes live, and never
    // moved again: it is the work's publication date, not the date of the most
    // recent edit. A work taken hidden and published again keeps the original.
    setWorkStatus: async (id, status) => {
      const result = await pool.query(
        `UPDATE works
         SET status = $2,
             published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now())
                                 ELSE published_at END,
             moderated_at = CASE WHEN $2 IN ('published', 'rejected', 'hidden') THEN now()
                                 ELSE moderated_at END,
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [id, status],
      )
      if (!result.rows[0]) return null
      return worksStore.getWorkById(id, { includeProtected: true })
    },

    // Returns the asset file URLs so the caller can unlink them, the same
    // contract deleteAccount uses. Files are removed after the row is gone, so
    // a failed unlink leaves an orphan rather than rolling back the delete --
    // scripts/find-orphaned-uploads.mjs is how those get found.
    deleteWork: async (id) => {
      const assets = await pool.query('SELECT file_url FROM work_assets WHERE work_id = $1', [id])
      const result = await pool.query('DELETE FROM works WHERE id = $1 RETURNING id', [id])
      if (!result.rows[0]) return null

      return {
        fileUrls: assets.rows
          .map((row) => row.file_url)
          .filter((url) => typeof url === 'string' && url.startsWith('/uploads/')),
      }
    },

    // The same rolling-window question communityStore.getUploadUsage answers,
    // asked about work assets. It has to exist: the storage budget was written
    // when community_uploads was the only way to put bytes on the disk, and a
    // works route that did not report here would be an unmetered second door
    // into the same 15GB.
    getUploadUsage: async (creatorId, windowMs) => {
      const result = await pool.query(
        `SELECT count(*)::int AS upload_count,
                coalesce(sum(work_assets.file_size), 0)::bigint AS total_bytes
         FROM work_assets
         JOIN works ON works.id = work_assets.work_id
         WHERE works.creator_id = $1
           AND work_assets.created_at > now() - ($2::bigint * interval '1 millisecond')`,
        [creatorId, windowMs],
      )

      const row = result.rows[0]
      return { bytes: Number(row?.total_bytes || 0), count: Number(row?.upload_count || 0) }
    },

    addAsset: async (workId, asset) => {
      const id = createId()
      const result = await pool.query(
        `INSERT INTO work_assets
           (id, work_id, kind, file_name, file_type, file_url, file_size, checksum, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 COALESCE((SELECT max(sort_order) + 1 FROM work_assets WHERE work_id = $2), 0))
         RETURNING *`,
        [
          id,
          workId,
          asset.kind,
          asset.fileName,
          asset.fileType || '',
          asset.fileUrl,
          asset.fileSize || 0,
          asset.checksum || null,
        ],
      )
      return toWorkAsset(result.rows[0], { includeProtected: true })
    },

    removeAsset: async (workId, assetId) => {
      const result = await pool.query(
        'DELETE FROM work_assets WHERE work_id = $1 AND id = $2 RETURNING file_url',
        [workId, assetId],
      )
      const row = result.rows[0]
      if (!row) return null
      return { fileUrl: row.file_url }
    },
  }

  return worksStore
}
