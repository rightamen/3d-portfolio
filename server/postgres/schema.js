// Every CREATE TABLE / ADD COLUMN the service needs, run once at startup.
// Additive only -- `IF NOT EXISTS` throughout -- so deploying a newer build
// against an older database migrates it, and rolling back leaves the extra
// columns behind harmlessly.

export const ensureSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS visitor_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      display_name text NOT NULL,
      password_hash text NOT NULL,
      access_level text NOT NULL DEFAULT 'member',
      email_verified_at timestamptz,
      verification_code_hash text,
      verification_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS visitor_sessions_user_idx
      ON visitor_sessions (user_id, expires_at);

    CREATE TABLE IF NOT EXISTS project_likes (
      project_slug text NOT NULL,
      visitor_id text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_slug, visitor_id)
    );

    CREATE TABLE IF NOT EXISTS project_comments (
      id text PRIMARY KEY,
      project_slug text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      author text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS project_comments_slug_created_idx
      ON project_comments (project_slug, created_at);

    CREATE TABLE IF NOT EXISTS download_requests (
      id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending',
      project_slug text NOT NULL,
      project_title text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      purpose text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      visitor_access_level text,
      ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS download_requests_status_created_idx
      ON download_requests (status, created_at);

    CREATE TABLE IF NOT EXISTS project_overrides (
      slug text PRIMARY KEY,
      title text,
      summary text,
      workflow text,
      year text,
      image text,
      model_url text,
      format text,
      model_size text,
      asset_category text,
      download_policy text,
      stack jsonb,
      viewer_features jsonb,
      is_public boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS custom_projects (
      slug text PRIMARY KEY,
      title text NOT NULL,
      summary text NOT NULL,
      workflow text,
      year text NOT NULL,
      image text NOT NULL,
      model_url text,
      format text,
      model_size text,
      asset_category text,
      download_policy text,
      stack jsonb NOT NULL DEFAULT '[]'::jsonb,
      viewer_features jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_public boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deleted_projects (
      slug text PRIMARY KEY,
      deleted_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS community_uploads (
      id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending',
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      title text NOT NULL,
      description text NOT NULL,
      asset_category text,
      file_name text NOT NULL,
      file_type text NOT NULL,
      file_size bigint NOT NULL,
      file_url text NOT NULL,
      preview_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_uploads_status_created_idx
      ON community_uploads (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS community_uploads_user_idx
      ON community_uploads (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_posts (
      id text PRIMARY KEY,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      topic text NOT NULL DEFAULT 'general',
      title text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_posts_created_idx
      ON community_posts (created_at DESC);

    CREATE INDEX IF NOT EXISTS community_posts_user_idx
      ON community_posts (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_comments (
      id text PRIMARY KEY,
      post_id text NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      parent_id text REFERENCES community_comments(id) ON DELETE CASCADE,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      author text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_comments_post_created_idx
      ON community_comments (post_id, created_at);

    CREATE INDEX IF NOT EXISTS community_comments_parent_idx
      ON community_comments (parent_id, created_at);

    CREATE INDEX IF NOT EXISTS community_comments_user_idx
      ON community_comments (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_comment_likes (
      comment_id text NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS community_comment_likes_comment_idx
      ON community_comment_likes (comment_id);

    CREATE TABLE IF NOT EXISTS admin_user_actions (
      id text PRIMARY KEY,
      visitor_user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      action text NOT NULL,
      fields jsonb NOT NULL DEFAULT '[]'::jsonb,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS admin_user_actions_user_created_idx
      ON admin_user_actions (visitor_user_id, created_at DESC);

    -- Short-lived admin sessions. The static ADMIN_TOKEN used to be stored in
    -- the browser's localStorage forever, so a single XSS or leak handed over
    -- permanent full control. The token is now exchanged once for a session
    -- that expires, can be revoked, and is recorded here per issuing IP.
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash text PRIMARY KEY,
      ip text,
      user_agent text,
      expires_at timestamptz NOT NULL,
      last_seen_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
      ON admin_sessions (expires_at);

    -- Named admin accounts. Until now "administrator" meant "whoever knows
    -- ADMIN_TOKEN": one shared secret, no second factor, and an audit trail
    -- (admin_user_actions) that records what was done to a visitor but not by
    -- whom. A row here is a person, so a session and every action taken in it
    -- can be attributed to one.
    --
    -- totp_last_step is what makes a six-digit code single-use: the step that
    -- last succeeded is remembered, and anything at or below it is refused.
    -- Without it a code shoulder-surfed or read out of a log stays valid for
    -- the rest of its 30 seconds.
    --
    -- recovery_code_hashes holds one-shot codes, hashed like passwords. They
    -- are what makes it safe to *require* the second factor: the answer to a
    -- lost phone is a code from the envelope, not an SSH session and a hand
    -- written UPDATE.
    CREATE TABLE IF NOT EXISTS admin_users (
      id text PRIMARY KEY,
      username text NOT NULL UNIQUE,
      display_name text,
      password_hash text NOT NULL,
      totp_secret text,
      totp_confirmed_at timestamptz,
      totp_last_step bigint NOT NULL DEFAULT 0,
      recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
      failed_login_count integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      disabled_at timestamptz,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- One-shot download tickets. The Web client used to pull the whole source
    -- archive through fetch() into a Blob just to attach an Authorization
    -- header, which OOMs the tab on large archives. A ticket lets the browser
    -- stream the file over a plain navigation instead, without the bearer
    -- token ever appearing in a URL that outlives the download.
    CREATE TABLE IF NOT EXISTS download_tickets (
      token_hash text PRIMARY KEY,
      project_slug text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS download_tickets_expires_idx
      ON download_tickets (expires_at);

    -- Audit trail for gated source downloads. Approving a request was recorded
    -- but the download itself was not, so there was no way to answer "who
    -- actually took this asset, and when".
    CREATE TABLE IF NOT EXISTS download_events (
      id text PRIMARY KEY,
      project_slug text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      actor text NOT NULL,
      ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS download_events_slug_created_idx
      ON download_events (project_slug, created_at DESC);
  `)

  await pool.query(`
    -- Attribution, added with the admin_users table. Both are nullable and
    -- ON DELETE SET NULL: sessions minted from the static ADMIN_TOKEN have no
    -- person behind them, and history must survive an account being removed --
    -- a NULL here means "the shared token", which is itself worth seeing in the
    -- audit trail.
    ALTER TABLE admin_sessions
      ADD COLUMN IF NOT EXISTS admin_user_id text REFERENCES admin_users(id) ON DELETE SET NULL;

    ALTER TABLE admin_user_actions
      ADD COLUMN IF NOT EXISTS actor_admin_user_id text REFERENCES admin_users(id) ON DELETE SET NULL;

    -- Self-service re-enrolment of the second factor. Before this, a lost
    -- authenticator meant SSH and scripts/admin-user.mjs, which is a poor
    -- answer to the most ordinary failure a TOTP setup has.
    --
    -- The candidate secret is kept *beside* the live one rather than replacing
    -- it, because the account has to stay usable until the new secret has
    -- proven it reached a phone: overwriting first would turn a mis-scan into a
    -- lockout, which is exactly the situation being recovered from. The live
    -- totp_secret is only replaced by a code generated from the candidate.
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS pending_totp_secret text,
      ADD COLUMN IF NOT EXISTS pending_totp_expires_at timestamptz;

    ALTER TABLE project_overrides
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE custom_projects
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE project_likes
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL;

    ALTER TABLE project_comments
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL;

    ALTER TABLE download_requests
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS visitor_access_level text;

    ALTER TABLE visitor_users
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS verification_code_hash text,
      ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS handle text,
      ADD COLUMN IF NOT EXISTS bio text,
      ADD COLUMN IF NOT EXISTS avatar_url text,
      ADD COLUMN IF NOT EXISTS banner_url text,
      ADD COLUMN IF NOT EXISTS location text,
      ADD COLUMN IF NOT EXISTS website text,
      ADD COLUMN IF NOT EXISTS public_email text,
      ADD COLUMN IF NOT EXISTS contact_links jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS profile_public boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS contacts_public boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS activity_public boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
      ADD COLUMN IF NOT EXISTS profile_admin_disabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS profile_admin_disabled_at timestamptz,
      ADD COLUMN IF NOT EXISTS profile_admin_disable_reason text,
      ADD COLUMN IF NOT EXISTS profile_moderated_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
      -- Per-account throttling. IP rate limits alone let an attacker with a
      -- proxy pool brute force both the password and the 6-digit verification
      -- code, because every bucket was keyed on the caller's address rather
      -- than on the account under attack.
      ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until timestamptz,
      ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0,
      -- Password reset and email change, neither of which existed before: a
      -- visitor who forgot their password had no way back into the account.
      ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
      ADD COLUMN IF NOT EXISTS password_reset_code_hash text,
      ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS password_reset_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pending_email text,
      ADD COLUMN IF NOT EXISTS pending_email_code_hash text,
      ADD COLUMN IF NOT EXISTS pending_email_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS pending_email_attempts integer NOT NULL DEFAULT 0;

    ALTER TABLE download_requests
      ADD COLUMN IF NOT EXISTS decided_at timestamptz,
      ADD COLUMN IF NOT EXISTS notified_at timestamptz;

    -- Project comments are moderated. Anonymous comments used to publish
    -- instantly with any author name the poster chose, and the only thing
    -- standing between the site and a spam run was a per-IP rate limit that
    -- cannot work here at all (docs/OPERATIONS_CLIENT_IP.md). Existing rows
    -- default to 'published' so nothing already on the site disappears.
    ALTER TABLE project_comments
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
      ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

    CREATE INDEX IF NOT EXISTS project_comments_status_created_idx
      ON project_comments (status, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS visitor_users_handle_unique_idx
      ON visitor_users (lower(handle))
      WHERE handle IS NOT NULL AND handle <> '';

    ALTER TABLE project_overrides
      ADD COLUMN IF NOT EXISTS title_zh text,
      ADD COLUMN IF NOT EXISTS title_en text,
      ADD COLUMN IF NOT EXISTS title_ja text,
      ADD COLUMN IF NOT EXISTS summary_zh text,
      ADD COLUMN IF NOT EXISTS summary_en text,
      ADD COLUMN IF NOT EXISTS summary_ja text,
      ADD COLUMN IF NOT EXISTS workflow_zh text,
      ADD COLUMN IF NOT EXISTS workflow_en text,
      ADD COLUMN IF NOT EXISTS workflow_ja text,
      ADD COLUMN IF NOT EXISTS format_zh text,
      ADD COLUMN IF NOT EXISTS format_en text,
      ADD COLUMN IF NOT EXISTS format_ja text,
      ADD COLUMN IF NOT EXISTS model_size_zh text,
      ADD COLUMN IF NOT EXISTS model_size_en text,
      ADD COLUMN IF NOT EXISTS model_size_ja text,
      ADD COLUMN IF NOT EXISTS download_policy_zh text,
      ADD COLUMN IF NOT EXISTS download_policy_en text,
      ADD COLUMN IF NOT EXISTS download_policy_ja text;

    ALTER TABLE custom_projects
      ADD COLUMN IF NOT EXISTS title_zh text,
      ADD COLUMN IF NOT EXISTS title_en text,
      ADD COLUMN IF NOT EXISTS title_ja text,
      ADD COLUMN IF NOT EXISTS summary_zh text,
      ADD COLUMN IF NOT EXISTS summary_en text,
      ADD COLUMN IF NOT EXISTS summary_ja text,
      ADD COLUMN IF NOT EXISTS workflow_zh text,
      ADD COLUMN IF NOT EXISTS workflow_en text,
      ADD COLUMN IF NOT EXISTS workflow_ja text,
      ADD COLUMN IF NOT EXISTS format_zh text,
      ADD COLUMN IF NOT EXISTS format_en text,
      ADD COLUMN IF NOT EXISTS format_ja text,
      ADD COLUMN IF NOT EXISTS model_size_zh text,
      ADD COLUMN IF NOT EXISTS model_size_en text,
      ADD COLUMN IF NOT EXISTS model_size_ja text,
      ADD COLUMN IF NOT EXISTS download_policy_zh text,
      ADD COLUMN IF NOT EXISTS download_policy_en text,
      ADD COLUMN IF NOT EXISTS download_policy_ja text;
  `)
}
