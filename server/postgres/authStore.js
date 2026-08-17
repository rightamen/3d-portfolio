import {
  publicContactLinks,
  toAccountProfile,
  toAccountUserRecord,
  toPrivateUser,
  toPublicProfile,
} from './mappers.js'

// Visitor accounts: registration, sign-in, email verification, password
// resets, and everything the owner of an account can see or change about it.

export const createAuthStore = ({ pool }) => {
  const authStore = {
    createUser: async (user) => {
      const result = await pool.query(
        `
          INSERT INTO visitor_users
            (
              id,
              email,
              display_name,
              password_hash,
              access_level,
              verification_code_hash,
              verification_expires_at
            )
          VALUES ($1, lower($2), $3, $4, $5, $6, $7)
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [
          user.id,
          user.email,
          user.displayName,
          user.passwordHash,
          user.accessLevel,
          user.verificationCodeHash,
          user.verificationExpiresAt,
        ],
      )

      return toAccountUserRecord(result.rows[0])
    },

    createSession: async (session) => {
      await pool.query(
        `
          INSERT INTO visitor_sessions (token_hash, user_id, expires_at)
          VALUES ($1, $2, $3)
        `,
        [session.tokenHash, session.userId, session.expiresAt],
      )
      await pool.query(
        `
          UPDATE visitor_users
          SET last_login_at = now(),
              updated_at = now()
          WHERE id = $1
        `,
        [session.userId],
      )
    },

    deleteSession: async (tokenHash) => {
      await pool.query('DELETE FROM visitor_sessions WHERE token_hash = $1', [tokenHash])
    },

    // Sessions live for 30 days and were only ever removed by an explicit
    // logout, so every abandoned session stayed in the table forever. Expired
    // rows can no longer authenticate (getSessionUser filters on expires_at),
    // but they still accumulate. Called on a timer from server/index.js.
    deleteExpiredSessions: async () => {
      const result = await pool.query('DELETE FROM visitor_sessions WHERE expires_at <= now()')
      return result.rowCount
    },

    getSessionUser: async (tokenHash) => {
      const result = await pool.query(
        `
          SELECT
            visitor_users.id,
            visitor_users.email,
            visitor_users.display_name,
            visitor_users.access_level,
            visitor_users.activity_public,
            visitor_users.avatar_url,
            visitor_users.banner_url,
            visitor_users.bio,
            visitor_users.email_verified_at,
            visitor_users.handle,
            visitor_users.location,
            visitor_users.profile_public,
            visitor_users.website,
            visitor_users.created_at
          FROM visitor_sessions
          JOIN visitor_users ON visitor_users.id = visitor_sessions.user_id
          WHERE visitor_sessions.token_hash = $1
            AND visitor_sessions.expires_at > now()
          LIMIT 1
        `,
        [tokenHash],
      )

      return toAccountUserRecord(result.rows[0])
    },

    getUserByEmail: async (email) => {
      const result = await pool.query(
        `
          SELECT id, email, display_name, password_hash, access_level, created_at
            , email_verified_at, verification_code_hash, verification_expires_at
            , failed_login_count, locked_until
          FROM visitor_users
          WHERE email = lower($1)
          LIMIT 1
        `,
        [email],
      )

      return toPrivateUser(result.rows[0])
    },

    verifyEmail: async (email, verificationCodeHash) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET email_verified_at = now(),
              verification_code_hash = null,
              verification_expires_at = null,
              updated_at = now()
          WHERE email = lower($1)
            AND verification_code_hash = $2
            AND verification_expires_at > now()
            AND email_verified_at IS NULL
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [email, verificationCodeHash],
      )

      return toAccountUserRecord(result.rows[0])
    },

    setVerificationCode: async (email, verificationCodeHash, verificationExpiresAt) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET verification_code_hash = $2,
              verification_expires_at = $3,
              -- Reset the attempt budget with the new code, otherwise a
              -- visitor who exhausted it can never complete verification:
              -- the first wrong digit on the fresh code would void it again.
              verification_attempts = 0,
              updated_at = now()
          WHERE email = lower($1)
            AND email_verified_at IS NULL
          RETURNING id
        `,
        [email, verificationCodeHash, verificationExpiresAt],
      )

      return Boolean(result.rows[0])
    },

    // ---------------------------------------------------------------------
    // Per-account throttling.
    //
    // The IP rate limiters in server/index.js cap how fast one address can
    // guess, but they do nothing about an attacker who spreads guesses across
    // a proxy pool: every request lands in a fresh bucket while the account
    // under attack absorbs all of them. These counters live on the account, so
    // the attempt budget is shared no matter where the guesses come from.
    // ---------------------------------------------------------------------

    registerFailedLogin: async (userId, { lockAfter, lockMs }) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET failed_login_count = failed_login_count + 1,
              locked_until = CASE
                WHEN failed_login_count + 1 >= $2
                  THEN now() + ($3::bigint * interval '1 millisecond')
                ELSE locked_until
              END,
              updated_at = now()
          WHERE id = $1
          RETURNING failed_login_count, locked_until
        `,
        [userId, lockAfter, lockMs],
      )

      const row = result.rows[0]
      if (!row) return { failedCount: 0, lockedUntil: null }

      return {
        failedCount: row.failed_login_count,
        lockedUntil: row.locked_until?.toISOString?.() || row.locked_until || null,
      }
    },

    clearLoginFailures: async (userId) => {
      await pool.query(
        `
          UPDATE visitor_users
          SET failed_login_count = 0,
              locked_until = null
          WHERE id = $1
            AND (failed_login_count <> 0 OR locked_until IS NOT NULL)
        `,
        [userId],
      )
    },

    // Burns one attempt against the stored verification code and destroys the
    // code once the budget is spent, so the 6-digit space cannot be walked.
    // Returns the attempt count after the increment.
    registerVerificationAttempt: async (email, { maxAttempts }) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET verification_attempts = verification_attempts + 1,
              verification_code_hash = CASE
                WHEN verification_attempts + 1 >= $2 THEN null
                ELSE verification_code_hash
              END,
              verification_expires_at = CASE
                WHEN verification_attempts + 1 >= $2 THEN null
                ELSE verification_expires_at
              END,
              updated_at = now()
          WHERE email = lower($1)
            AND email_verified_at IS NULL
          RETURNING verification_attempts
        `,
        [email, maxAttempts],
      )

      return result.rows[0]?.verification_attempts ?? 0
    },

    // ---------------------------------------------------------------------
    // Password reset.
    //
    // Previously absent entirely: a visitor who forgot their password was
    // permanently locked out and could only be recovered by hand-editing the
    // database. A successful reset also invalidates every existing session,
    // which is the point of resetting after a suspected compromise.
    // ---------------------------------------------------------------------

    setPasswordResetCode: async (email, codeHash, expiresAt) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET password_reset_code_hash = $2,
              password_reset_expires_at = $3,
              password_reset_attempts = 0,
              updated_at = now()
          WHERE email = lower($1)
            AND email_verified_at IS NOT NULL
          RETURNING id
        `,
        [email, codeHash, expiresAt],
      )

      return Boolean(result.rows[0])
    },

    registerPasswordResetAttempt: async (email, { maxAttempts }) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET password_reset_attempts = password_reset_attempts + 1,
              password_reset_code_hash = CASE
                WHEN password_reset_attempts + 1 >= $2 THEN null
                ELSE password_reset_code_hash
              END,
              password_reset_expires_at = CASE
                WHEN password_reset_attempts + 1 >= $2 THEN null
                ELSE password_reset_expires_at
              END,
              updated_at = now()
          WHERE email = lower($1)
          RETURNING password_reset_attempts
        `,
        [email, maxAttempts],
      )

      return result.rows[0]?.password_reset_attempts ?? 0
    },

    resetPasswordWithCode: async (email, codeHash, passwordHash) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        const result = await client.query(
          `
            UPDATE visitor_users
            SET password_hash = $3,
                password_changed_at = now(),
                password_reset_code_hash = null,
                password_reset_expires_at = null,
                password_reset_attempts = 0,
                failed_login_count = 0,
                locked_until = null,
                updated_at = now()
            WHERE email = lower($1)
              AND password_reset_code_hash = $2
              AND password_reset_expires_at > now()
            RETURNING id, email, display_name, access_level, email_verified_at, created_at
          `,
          [email, codeHash, passwordHash],
        )

        const row = result.rows[0]
        if (!row) {
          await client.query('ROLLBACK')
          return null
        }

        // Anyone holding a session issued before the reset loses it.
        await client.query('DELETE FROM visitor_sessions WHERE user_id = $1', [row.id])
        await client.query('COMMIT')

        return toAccountUserRecord(row)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    getPasswordHash: async (userId) => {
      const result = await pool.query(
        'SELECT password_hash FROM visitor_users WHERE id = $1 LIMIT 1',
        [userId],
      )

      return result.rows[0]?.password_hash || null
    },

    // Changing a known password keeps the caller signed in on the current
    // device (the caller passes its own token hash) and drops every other
    // session, which is what "sign out my other devices" has to mean.
    updatePassword: async (userId, passwordHash, { keepTokenHash = null } = {}) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        await client.query(
          `
            UPDATE visitor_users
            SET password_hash = $2,
                password_changed_at = now(),
                failed_login_count = 0,
                locked_until = null,
                updated_at = now()
            WHERE id = $1
          `,
          [userId, passwordHash],
        )
        await client.query(
          `
            DELETE FROM visitor_sessions
            WHERE user_id = $1
              AND ($2::text IS NULL OR token_hash <> $2)
          `,
          [userId, keepTokenHash],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    deleteSessionsForUser: async (userId, { keepTokenHash = null } = {}) => {
      const result = await pool.query(
        `
          DELETE FROM visitor_sessions
          WHERE user_id = $1
            AND ($2::text IS NULL OR token_hash <> $2)
        `,
        [userId, keepTokenHash],
      )

      return result.rowCount
    },

    countSessions: async (userId) => {
      const result = await pool.query(
        'SELECT count(*)::int AS total FROM visitor_sessions WHERE user_id = $1 AND expires_at > now()',
        [userId],
      )

      return result.rows[0]?.total ?? 0
    },

    // ---------------------------------------------------------------------
    // Email change. The code goes to the NEW address only: proving control of
    // the new mailbox is the entire security property. The old address keeps
    // working for sign-in until the change is confirmed.
    // ---------------------------------------------------------------------

    setPendingEmail: async (userId, pendingEmail, codeHash, expiresAt) => {
      await pool.query(
        `
          UPDATE visitor_users
          SET pending_email = lower($2),
              pending_email_code_hash = $3,
              pending_email_expires_at = $4,
              pending_email_attempts = 0,
              updated_at = now()
          WHERE id = $1
        `,
        [userId, pendingEmail, codeHash, expiresAt],
      )
    },

    registerPendingEmailAttempt: async (userId, { maxAttempts }) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET pending_email_attempts = pending_email_attempts + 1,
              pending_email_code_hash = CASE
                WHEN pending_email_attempts + 1 >= $2 THEN null
                ELSE pending_email_code_hash
              END,
              updated_at = now()
          WHERE id = $1
          RETURNING pending_email_attempts
        `,
        [userId, maxAttempts],
      )

      return result.rows[0]?.pending_email_attempts ?? 0
    },

    confirmPendingEmail: async (userId, codeHash) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET email = pending_email,
              pending_email = null,
              pending_email_code_hash = null,
              pending_email_expires_at = null,
              pending_email_attempts = 0,
              updated_at = now()
          WHERE id = $1
            AND pending_email IS NOT NULL
            AND pending_email_code_hash = $2
            AND pending_email_expires_at > now()
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [userId, codeHash],
      )

      return toAccountUserRecord(result.rows[0])
    },

    cancelPendingEmail: async (userId) => {
      await pool.query(
        `
          UPDATE visitor_users
          SET pending_email = null,
              pending_email_code_hash = null,
              pending_email_expires_at = null,
              pending_email_attempts = 0,
              updated_at = now()
          WHERE id = $1
        `,
        [userId],
      )
    },

    // Account deletion. Deliberately NOT a blanket cascade.
    //
    // Most content FKs are ON DELETE SET NULL, so posts and comments survive as
    // orphaned rows — that is the right default, because deleting a post would
    // take other people's replies with it. What SET NULL does not handle is the
    // personal data denormalized onto those rows (project_comments.author,
    // download_requests.name/email) and the uploaded files, which would sit on
    // disk forever with nothing pointing at them. Both are handled explicitly
    // here. Returns the upload URLs so the caller can unlink the files.
    deleteAccount: async (userId) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')

        const uploads = await client.query(
          'SELECT file_url, preview_url FROM community_uploads WHERE user_id = $1',
          [userId],
        )
        await client.query('DELETE FROM community_uploads WHERE user_id = $1', [userId])

        await client.query(
          `
            UPDATE project_comments
            SET author = 'Deleted user'
            WHERE user_id = $1
          `,
          [userId],
        )

        await client.query(
          `
            UPDATE download_requests
            SET name = 'Deleted user',
                email = ''
            WHERE user_id = $1
          `,
          [userId],
        )

        const result = await client.query(
          'DELETE FROM visitor_users WHERE id = $1 RETURNING id',
          [userId],
        )

        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }

        await client.query('COMMIT')

        return {
          fileUrls: uploads.rows
            .flatMap((row) => [row.file_url, row.preview_url])
            .filter((url) => typeof url === 'string' && url.startsWith('/uploads/')),
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    getAccountProfile: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            visitor_users.*,
            (
              (SELECT count(*)::int FROM project_likes WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comment_likes WHERE user_id = visitor_users.id)
            ) AS like_count,
            (
              (SELECT count(*)::int FROM project_comments WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comments WHERE user_id = visitor_users.id)
            ) AS comment_count,
            (SELECT count(*)::int FROM download_requests WHERE user_id = visitor_users.id)
              AS download_request_count,
            (SELECT count(*)::int FROM community_uploads WHERE user_id = visitor_users.id)
              AS upload_count,
            (SELECT count(*)::int FROM community_posts WHERE user_id = visitor_users.id)
              AS post_count
          FROM visitor_users
          WHERE visitor_users.id = $1
          LIMIT 1
        `,
        [userId],
      )

      return toAccountProfile(result.rows[0])
    },

    updateAccountProfile: async (userId, profile) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET display_name = $2,
              handle = $3,
              bio = $4,
              location = $5,
              website = $6,
              public_email = $7,
              contact_links = $8::jsonb,
              profile_public = $9,
              contacts_public = $10,
              activity_public = $11,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [
          userId,
          profile.displayName,
          profile.handle,
          profile.bio,
          profile.location,
          profile.website,
          profile.publicEmail,
          JSON.stringify(profile.contactLinks || {}),
          profile.profilePublic,
          profile.contactsPublic,
          profile.activityPublic,
        ],
      )

      if (!result.rows[0]) return null
      return authStore.getAccountProfile(userId)
    },

    updateAccountImage: async (userId, field, url) => {
      const column = field === 'banner' ? 'banner_url' : 'avatar_url'
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET ${column} = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [userId, url],
      )

      if (!result.rows[0]) return null
      return authStore.getAccountProfile(userId)
    },

    getUserByHandle: async (handle) => {
      const result = await pool.query(
        `
          SELECT
            visitor_users.*,
            (
              (SELECT count(*)::int FROM project_likes WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comment_likes WHERE user_id = visitor_users.id)
            ) AS like_count,
            (
              (SELECT count(*)::int FROM project_comments WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comments WHERE user_id = visitor_users.id)
            ) AS comment_count,
            (SELECT count(*)::int FROM download_requests WHERE user_id = visitor_users.id)
              AS download_request_count,
            (SELECT count(*)::int FROM community_uploads WHERE user_id = visitor_users.id)
              AS upload_count,
            (SELECT count(*)::int FROM community_posts WHERE user_id = visitor_users.id)
              AS post_count
          FROM visitor_users
          WHERE lower(visitor_users.handle) = lower($1)
          LIMIT 1
        `,
        [handle],
      )
      const profile = toPublicProfile(result.rows[0])
      if (!profile) return null

      return {
        ...profile,
        contactLinks: publicContactLinks(result.rows[0].contact_links, profile.contactsPublic),
        internalId: result.rows[0].id,
      }
    },
  }

  return authStore
}
