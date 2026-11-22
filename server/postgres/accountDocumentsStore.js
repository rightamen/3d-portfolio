const publicDocumentsFrom = `
  FROM account_documents AS document
  JOIN visitor_users AS owner ON owner.id = document.user_id
  WHERE lower(owner.handle) = lower($1)
    AND owner.profile_public IS NOT FALSE
    AND NOT owner.profile_admin_disabled
    AND document.profile_visible
`

export const createAccountDocumentsStore = ({ pool }) => ({
  async list(userId) {
    const { rows } = await pool.query(
      'SELECT kind, stored_name, file_name, byte_size, updated_at, profile_visible FROM account_documents WHERE user_id = $1 ORDER BY kind',
      [userId],
    )
    return rows
  },

  async get(userId, kind) {
    const { rows } = await pool.query(
      'SELECT * FROM account_documents WHERE user_id = $1 AND kind = $2',
      [userId, kind],
    )
    return rows[0] ?? null
  },

  async replace(userId, kind, { storedName, fileName, byteSize }) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Use the account row to serialize even the first upload to an empty slot.
      const account = await client.query('SELECT id FROM visitor_users WHERE id = $1 FOR UPDATE', [userId])
      if (!account.rowCount) {
        await client.query('ROLLBACK')
        return null
      }
      const previous = await client.query(
        'DELETE FROM account_documents WHERE user_id = $1 AND kind = $2 RETURNING stored_name',
        [userId, kind],
      )
      const { rows } = await client.query(
        `INSERT INTO account_documents (user_id, kind, stored_name, file_name, byte_size)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING kind, stored_name, file_name, byte_size, updated_at, profile_visible`,
        [userId, kind, storedName, fileName, byteSize],
      )
      await client.query('COMMIT')
      return { document: rows[0], previousName: previous.rows[0]?.stored_name }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async listForProfile(handle) {
    const { rows } = await pool.query(
      `SELECT document.kind, document.file_name, document.byte_size, document.updated_at
       ${publicDocumentsFrom} ORDER BY document.kind`,
      [handle],
    )
    return rows
  },

  async getForProfile(handle, kind) {
    const { rows } = await pool.query(
      `SELECT document.user_id, document.stored_name, document.file_name
       ${publicDocumentsFrom} AND document.kind = $2`,
      [handle, kind],
    )
    return rows[0] ?? null
  },

  async setProfileVisibility(userId, kind, version, visible) {
    const { rows } = await pool.query(
      `UPDATE account_documents
       SET profile_visible = $4
       WHERE user_id = $1 AND kind = $2 AND stored_name = $3
       RETURNING kind, stored_name, file_name, byte_size, updated_at, profile_visible`,
      [userId, kind, version, visible],
    )
    return rows[0] ?? null
  },

  async remove(userId, kind) {
    const { rows } = await pool.query(
      'DELETE FROM account_documents WHERE user_id = $1 AND kind = $2 RETURNING stored_name',
      [userId, kind],
    )
    return rows[0]?.stored_name
  },
})
