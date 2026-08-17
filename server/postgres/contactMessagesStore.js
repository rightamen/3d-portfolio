import { createId } from './mappers.js'

// The contact form's inbox.

export const createContactMessagesStore = ({ pool }) => ({
  addMessage: async (message) => {
    const id = createId()
    const result = await pool.query(
      `
        INSERT INTO contact_messages (id, name, email, message)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
      `,
      [id, message.name, message.email, message.message],
    )

    return {
      id,
      ...message,
      createdAt: result.rows[0].created_at.toISOString(),
    }
  },
})
