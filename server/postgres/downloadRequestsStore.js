import { createId } from './mappers.js'

// Requests to download a gated asset, and the decisions taken on them.

export const createDownloadRequestsStore = ({ pool }) => ({
  addRequest: async (request) => {
    const id = createId()
    const result = await pool.query(
      `
        INSERT INTO download_requests
          (
            id,
            status,
            project_slug,
            project_title,
            name,
            email,
            purpose,
            user_id,
            visitor_access_level,
            ip
          )
        VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, status, created_at
      `,
      [
        id,
        request.projectSlug,
        request.projectTitle,
        request.name,
        request.email,
        request.purpose,
        request.userId || null,
        request.visitorAccessLevel || null,
        request.ip,
      ],
    )

    return {
      id,
      status: result.rows[0].status,
      ...request,
      createdAt: result.rows[0].created_at.toISOString(),
    }
  },

  listUserRequests: async (userId) => {
    const result = await pool.query(
      `
        SELECT
          id,
          status,
          project_slug,
          project_title,
          purpose,
          visitor_access_level,
          created_at
        FROM download_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      projectSlug: row.project_slug,
      projectTitle: row.project_title,
      purpose: row.purpose,
      visitorAccessLevel: row.visitor_access_level,
      createdAt: row.created_at.toISOString(),
    }))
  },

  // Check if a user or email has an approved download request for a project.
  // Used by the download endpoint to gate source archive access.
  hasApprovedRequest: async (projectSlug, userId, email) => {
    const result = await pool.query(
      `
        SELECT id
        FROM download_requests
        WHERE project_slug = $1
          AND status = 'approved'
          AND (user_id = $2 OR (user_id IS NULL AND email = $3))
        LIMIT 1
      `,
      [projectSlug, userId || null, email || null],
    )

    return result.rowCount > 0
  },

  // One-shot, short-lived tickets so the browser can stream a gated archive
  // over a plain navigation instead of buffering it through fetch(). The
  // ticket is single-use and scoped to one project, so a copied URL is worth
  // at most one download inside its short window.
  createDownloadTicket: async ({ expiresAt, projectSlug, tokenHash, userId }) => {
    await pool.query(
      `
        INSERT INTO download_tickets (token_hash, project_slug, user_id, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [tokenHash, projectSlug, userId || null, expiresAt],
    )
  },

  // Marks the ticket used and returns it in the same statement, so two
  // concurrent requests cannot both redeem one ticket.
  consumeDownloadTicket: async (tokenHash, projectSlug) => {
    const result = await pool.query(
      `
        UPDATE download_tickets
        SET used_at = now()
        WHERE token_hash = $1
          AND project_slug = $2
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING project_slug, user_id
      `,
      [tokenHash, projectSlug],
    )

    const row = result.rows[0]
    return row ? { projectSlug: row.project_slug, userId: row.user_id } : null
  },

  deleteExpiredDownloadTickets: async () => {
    const result = await pool.query(
      "DELETE FROM download_tickets WHERE expires_at <= now() - interval '1 day'",
    )

    return result.rowCount
  },

  recordDownloadEvent: async ({ actor, ip, projectSlug, userId }) => {
    await pool.query(
      `
        INSERT INTO download_events (id, project_slug, user_id, actor, ip)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [createId(), projectSlug, userId || null, actor, ip || null],
    )
  },
})
