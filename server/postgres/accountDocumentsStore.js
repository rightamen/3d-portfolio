export const createAccountDocumentsStore = ({ pool }) => ({
  async list(userId) {
    const { rows } = await pool.query(
      'SELECT kind, file_name, byte_size, updated_at FROM account_documents WHERE user_id = $1 ORDER BY kind',
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
         RETURNING kind, file_name, byte_size, updated_at`,
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

  async remove(userId, kind) {
    const { rows } = await pool.query(
      'DELETE FROM account_documents WHERE user_id = $1 AND kind = $2 RETURNING stored_name',
      [userId, kind],
    )
    return rows[0]?.stored_name
  },
})
