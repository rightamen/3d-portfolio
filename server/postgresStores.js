import pg from 'pg'

const { Pool } = pg

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Author summary attached to comments, posts, and uploads. The account email is
// PII and must never reach an unauthenticated response, so it is opt-in: only
// adminStore call sites pass includeEmail. Public list/detail endpoints reuse
// the same mappers and therefore stay email-free by construction.
const toUserSummary = (row, { includeEmail = false } = {}) =>
  row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        id: row.user_id,
        ...(includeEmail ? { email: row.email } : {}),
      }
    : null

const toComment = (row, options) => ({
  id: row.id,
  projectSlug: row.project_slug,
  author: row.author,
  message: row.message,
  user: toUserSummary(row, options),
  createdAt: row.created_at.toISOString(),
})

// Full account record including the login email. Despite the historical name
// this was never a public shape: every call site is the account's own profile,
// an internal auth lookup, or an adminStore mutation. Other people's profiles
// go through toPublicProfile, which exposes public_email only when
// contacts_public is on. Do not reuse this for unauthenticated responses.
const toAccountUserRecord = (row) =>
  row
    ? {
        accessLevel: row.access_level,
        activityPublic: row.activity_public !== false,
        avatarUrl: row.avatar_url || '',
        bannerUrl: row.banner_url || '',
        bio: row.bio || '',
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        displayName: row.display_name,
        email: row.email,
        emailVerified: Boolean(row.email_verified_at),
        emailVerifiedAt: row.email_verified_at?.toISOString?.() || row.email_verified_at || null,
        handle: row.handle || '',
        id: row.id,
        location: row.location || '',
        profileAdminDisabled: row.profile_admin_disabled === true,
        profilePublic: row.profile_public !== false,
        website: row.website || '',
      }
    : null

// The full admin row, secrets included: this one is only ever handed to the
// sign-in path in server/index.js, never to a response. Anything an API returns
// about an admin account goes through listAdminUsers instead, which selects the
// columns explicitly and cannot leak a hash or a TOTP secret by accident.
const toAdminUser = (row) =>
  row
    ? {
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        disabledAt: row.disabled_at?.toISOString?.() || row.disabled_at || null,
        displayName: row.display_name,
        failedLoginCount: Number(row.failed_login_count || 0),
        id: row.id,
        lastLoginAt: row.last_login_at?.toISOString?.() || row.last_login_at || null,
        lockedUntil: row.locked_until?.toISOString?.() || row.locked_until || null,
        passwordHash: row.password_hash,
        recoveryCodeHashes: Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes : [],
        totpConfirmedAt: row.totp_confirmed_at?.toISOString?.() || row.totp_confirmed_at || null,
        // bigint comes back as a string from pg; the caller compares it against
        // a JS number, so the conversion happens once, here.
        pendingTotpExpiresAt:
          row.pending_totp_expires_at?.toISOString?.() || row.pending_totp_expires_at || null,
        pendingTotpSecret: row.pending_totp_secret || null,
        totpLastStep: Number(row.totp_last_step || 0),
        totpSecret: row.totp_secret,
        username: row.username,
      }
    : null

const toPrivateUser = (row) =>
  row
    ? {
        ...toAccountUserRecord(row),
        failedLoginCount: Number(row.failed_login_count || 0),
        lockedUntil: row.locked_until?.toISOString?.() || row.locked_until || null,
        passwordHash: row.password_hash,
      }
    : null

const toAccountProfile = (row) =>
  row
    ? {
        ...toAccountUserRecord(row),
        contactLinks: row.contact_links || {},
        contactsPublic: row.contacts_public === true,
        lastLoginAt: row.last_login_at?.toISOString?.() || row.last_login_at || null,
        passwordChangedAt:
          row.password_changed_at?.toISOString?.() || row.password_changed_at || null,
        // Only ever returned to the account itself (getAccountProfile), so the
        // in-flight address is safe to surface — the UI needs it to show what
        // the pending confirmation code was sent to.
        pendingEmail: row.pending_email || '',
        pendingEmailExpiresAt:
          row.pending_email_expires_at?.toISOString?.() || row.pending_email_expires_at || null,
        profileAdminDisabled: row.profile_admin_disabled === true,
        profileAdminDisabledAt:
          row.profile_admin_disabled_at?.toISOString?.() || row.profile_admin_disabled_at || null,
        publicEmail: row.public_email || '',
        stats: {
          commentCount: Number(row.comment_count || 0),
          downloadRequestCount: Number(row.download_request_count || 0),
          likeCount: Number(row.like_count || 0),
          postCount: Number(row.post_count || 0),
          uploadCount: Number(row.upload_count || 0),
        },
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at || null,
      }
    : null

const toPublicProfile = (row) =>
  row
    ? {
        activityPublic: row.activity_public !== false,
        avatarUrl: row.avatar_url || '',
        bannerUrl: row.banner_url || '',
        bio: row.bio || '',
        contactsPublic: row.contacts_public === true,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        displayName: row.display_name,
        handle: row.handle || '',
        location: row.location || '',
        profilePublic: row.profile_public !== false,
        profileAdminDisabled: row.profile_admin_disabled === true,
        publicEmail: row.contacts_public === true ? row.public_email || '' : '',
        stats:
          row.activity_public !== false
            ? {
                commentCount: Number(row.comment_count || 0),
                downloadRequestCount: Number(row.download_request_count || 0),
                likeCount: Number(row.like_count || 0),
                postCount: Number(row.post_count || 0),
                uploadCount: Number(row.upload_count || 0),
              }
            : null,
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at || null,
        website: row.website || '',
      }
    : null

const publicContactLinks = (contactLinks = {}, contactsPublic = false) => {
  if (!contactsPublic || !contactLinks || typeof contactLinks !== 'object') return {}

  return Object.fromEntries(
    Object.entries(contactLinks)
      .filter(([, item]) => item && typeof item === 'object' && item.public === true)
      .map(([key, item]) => [
        key,
        {
          label: item.label || key,
          url: item.url || '',
          value: item.value || '',
        },
      ])
      .filter(([, item]) => item.url || item.value),
  )
}

const toCommunityUpload = (row, options) => ({
  assetCategory: row.asset_category,
  createdAt: row.created_at.toISOString(),
  description: row.description,
  fileName: row.file_name,
  fileSize: Number(row.file_size),
  fileType: row.file_type,
  fileUrl: row.file_url,
  id: row.id,
  previewUrl: row.preview_url,
  status: row.status,
  title: row.title,
  updatedAt: row.updated_at.toISOString(),
  user: toUserSummary(row, options),
})

const toCommunityPost = (row, options) => ({
  createdAt: row.created_at.toISOString(),
  id: row.id,
  message: row.message,
  title: row.title,
  topic: row.topic,
  updatedAt: row.updated_at.toISOString(),
  user: toUserSummary(row, options),
})

const toCommunityComment = (row) => ({
  author: row.author,
  createdAt: row.created_at.toISOString(),
  id: row.id,
  likeCount: Number(row.like_count || 0),
  liked: Boolean(row.liked),
  message: row.message,
  parentId: row.parent_id || null,
  postId: row.post_id,
  updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  user: row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        id: row.user_id,
      }
    : null,
})

const toProjectOverride = (row) => ({
  assetCategory: row.asset_category,
  downloadPolicy: row.download_policy,
  downloadPolicyEn: row.download_policy_en,
  downloadPolicyJa: row.download_policy_ja,
  downloadPolicyZh: row.download_policy_zh,
  format: row.format,
  formatEn: row.format_en,
  formatJa: row.format_ja,
  formatZh: row.format_zh,
  image: row.image,
  isPublic: row.is_public,
  modelSize: row.model_size,
  modelSizeEn: row.model_size_en,
  modelSizeJa: row.model_size_ja,
  modelSizeZh: row.model_size_zh,
  modelUrl: row.model_url,
  slug: row.slug,
  stack: row.stack,
  summary: row.summary,
  summaryEn: row.summary_en,
  summaryJa: row.summary_ja,
  summaryZh: row.summary_zh,
  title: row.title,
  titleEn: row.title_en,
  titleJa: row.title_ja,
  titleZh: row.title_zh,
  viewerFeatures: row.viewer_features,
  workflow: row.workflow,
  workflowEn: row.workflow_en,
  workflowJa: row.workflow_ja,
  workflowZh: row.workflow_zh,
  year: row.year,
})

const toCustomProject = (row) => ({
  assetCategory: row.asset_category,
  downloadPolicy: row.download_policy,
  downloadPolicyEn: row.download_policy_en,
  downloadPolicyJa: row.download_policy_ja,
  downloadPolicyZh: row.download_policy_zh,
  format: row.format,
  formatEn: row.format_en,
  formatJa: row.format_ja,
  formatZh: row.format_zh,
  image: row.image,
  isPublic: row.is_public,
  modelSize: row.model_size,
  modelSizeEn: row.model_size_en,
  modelSizeJa: row.model_size_ja,
  modelSizeZh: row.model_size_zh,
  modelUrl: row.model_url,
  slug: row.slug,
  stack: row.stack || [],
  summary: row.summary,
  summaryEn: row.summary_en,
  summaryJa: row.summary_ja,
  summaryZh: row.summary_zh,
  title: row.title,
  titleEn: row.title_en,
  titleJa: row.title_ja,
  titleZh: row.title_zh,
  viewerFeatures: row.viewer_features || [],
  workflow: row.workflow,
  workflowEn: row.workflow_en,
  workflowJa: row.workflow_ja,
  workflowZh: row.workflow_zh,
  year: row.year,
})

const mergeProject = (project, override) => {
  if (!override) return { ...project, isPublic: true }

  return {
    ...project,
    ...Object.fromEntries(
      Object.entries(override).filter(
        ([key, value]) => key !== 'slug' && value !== null && value !== undefined,
      ),
    ),
  }
}

const localizedProjectFields = [
  'titleZh',
  'titleEn',
  'titleJa',
  'summaryZh',
  'summaryEn',
  'summaryJa',
  'workflowZh',
  'workflowEn',
  'workflowJa',
  'formatZh',
  'formatEn',
  'formatJa',
  'modelSizeZh',
  'modelSizeEn',
  'modelSizeJa',
  'downloadPolicyZh',
  'downloadPolicyEn',
  'downloadPolicyJa',
]

const getLocalizedProjectValues = (project) =>
  localizedProjectFields.map((field) => project[field] || null)

const ensureSchema = async (pool) => {
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

export const createPostgresStores = async (databaseUrl) => {
  // Several writes (toggleLike, toggleCommentLike, profile moderation) hold a
  // dedicated client for the length of a transaction. A pool of 2 meant two
  // concurrent likes could starve every other query until connectionTimeoutMillis.
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })

  await ensureSchema(pool)

  const projectStore = {
    listProjects: async (baseProjects, { includeHidden = false } = {}) => {
      const result = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM project_overrides
      `)
      const customResult = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM custom_projects
        ORDER BY created_at DESC
      `)
      const deletedResult = await pool.query('SELECT slug FROM deleted_projects')
      const deletedSlugs = new Set(deletedResult.rows.map((row) => row.slug))
      const overrides = new Map(
        result.rows.map((row) => [row.slug, toProjectOverride(row)]),
      )
      const customProjects = customResult.rows.map(toCustomProject)

      return [
        ...customProjects,
        ...baseProjects.map((project) => mergeProject(project, overrides.get(project.slug))),
      ]
        .filter((project) => !deletedSlugs.has(project.slug))
        .filter((project) => includeHidden || project.isPublic !== false)
    },

    getProject: async (baseProjects, slug, { includeHidden = false } = {}) => {
      const projects = await projectStore.listProjects(baseProjects, { includeHidden })
      return projects.find((project) => project.slug === slug) || null
    },
  }

  const contactMessagesStore = {
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
  }

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

  const interactionsStore = {
    getProjectState: async (slug) => {
      const [likesResult, commentsResult] = await Promise.all([
        pool.query('SELECT count(*)::int AS count FROM project_likes WHERE project_slug = $1', [
          slug,
        ]),
        pool.query(
          `
            SELECT
              project_comments.id,
              project_comments.project_slug,
              project_comments.author,
              project_comments.message,
              project_comments.created_at,
              visitor_users.id AS user_id,
              visitor_users.display_name,
              visitor_users.access_level
            FROM project_comments
            LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
            WHERE project_comments.project_slug = $1
              -- Pending and spam rows exist but are not public.
              AND project_comments.status = 'published'
            ORDER BY project_comments.created_at ASC
            LIMIT 100
          `,
          [slug],
        ),
      ])

      return {
        likes: Array.from({ length: likesResult.rows[0].count }, (_, index) => String(index)),
        comments: commentsResult.rows.map((row) => toComment(row)),
      }
    },

    toggleLike: async (slug, visitorId, userId = null) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        const deleted = await client.query(
          `
            DELETE FROM project_likes
            WHERE project_slug = $1 AND visitor_id = $2
            RETURNING visitor_id
          `,
          [slug, visitorId],
        )

        const liked = deleted.rowCount === 0

        if (liked) {
          await client.query(
            `
              INSERT INTO project_likes (project_slug, visitor_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [slug, visitorId],
          )

          if (userId) {
            await client.query(
              `
                UPDATE project_likes
                SET user_id = $3
                WHERE project_slug = $1 AND visitor_id = $2
              `,
              [slug, visitorId, userId],
            )
          }
        }

        const countResult = await client.query(
          'SELECT count(*)::int AS count FROM project_likes WHERE project_slug = $1',
          [slug],
        )
        await client.query('COMMIT')

        return {
          liked,
          likeCount: countResult.rows[0].count,
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    // Counts what one account has posted in a rolling window. Used instead of
    // a per-IP limiter, which is meaningless on this deployment.
    countRecentUserComments: async (userId, windowMs) => {
      const result = await pool.query(
        `
          SELECT count(*)::int AS total
          FROM project_comments
          WHERE user_id = $1
            AND created_at > now() - ($2::bigint * interval '1 millisecond')
        `,
        [userId, windowMs],
      )

      return result.rows[0]?.total ?? 0
    },

    // Detects a poster repeating the same message, which is what a spam run
    // looks like and what a human almost never does.
    hasRecentDuplicate: async ({ message, slug, userId }, windowMs) => {
      const result = await pool.query(
        `
          SELECT 1
          FROM project_comments
          WHERE project_slug = $1
            AND message = $2
            AND ($3::text IS NULL OR user_id = $3)
            AND created_at > now() - ($4::bigint * interval '1 millisecond')
          LIMIT 1
        `,
        [slug, message, userId || null, windowMs],
      )

      return result.rowCount > 0
    },

    addComment: async (slug, comment) => {
      const id = createId()
      const result = await pool.query(
        `
          INSERT INTO project_comments (id, project_slug, user_id, author, message, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, project_slug, author, message, created_at, user_id, status
        `,
        [id, slug, comment.userId || null, comment.author, comment.message, comment.status || 'published'],
      )

      if (!comment.userId) return { ...toComment(result.rows[0]), status: result.rows[0].status }

      const enriched = await pool.query(
        `
          SELECT
            project_comments.id,
            project_comments.project_slug,
            project_comments.author,
            project_comments.message,
            project_comments.created_at,
            project_comments.status,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM project_comments
          LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
          WHERE project_comments.id = $1
        `,
        [id],
      )

      return { ...toComment(enriched.rows[0]), status: enriched.rows[0].status }
    },

    // The account page shows the author their own comments including the ones
    // still awaiting review, so a pending comment does not look like it
    // vanished.
    listUserComments: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            project_comments.id,
            project_comments.project_slug,
            project_comments.author,
            project_comments.message,
            project_comments.created_at,
            project_comments.status,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM project_comments
          LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
          WHERE project_comments.user_id = $1
          ORDER BY project_comments.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => ({ ...toComment(row), status: row.status }))
    },

    countUserLikes: async (userId) => {
      const result = await pool.query(
        'SELECT count(*)::int AS count FROM project_likes WHERE user_id = $1',
        [userId],
      )

      return result.rows[0].count
    },
  }

  const downloadRequestsStore = {
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
  }

  const communityStore = {
    // Rolling-window upload usage for one account. The per-IP limiter capped
    // request count but nothing capped stored bytes, so a single member could
    // park gigabytes on the VPS disk one 120MB model at a time.
    getUploadUsage: async (userId, windowMs) => {
      const result = await pool.query(
        `
          SELECT
            count(*)::int AS upload_count,
            coalesce(sum(file_size), 0)::bigint AS total_bytes
          FROM community_uploads
          WHERE user_id = $1
            AND created_at > now() - ($2::bigint * interval '1 millisecond')
        `,
        [userId, windowMs],
      )

      const row = result.rows[0]
      return {
        bytes: Number(row?.total_bytes || 0),
        count: Number(row?.upload_count || 0),
      }
    },

    listApprovedUploads: async () => {
      const result = await pool.query(`
        SELECT
          community_uploads.id,
          community_uploads.status,
          community_uploads.title,
          community_uploads.description,
          community_uploads.asset_category,
          community_uploads.file_name,
          community_uploads.file_type,
          community_uploads.file_size,
          community_uploads.file_url,
          community_uploads.preview_url,
          community_uploads.created_at,
          community_uploads.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        WHERE community_uploads.status = 'approved'
        ORDER BY community_uploads.created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => toCommunityUpload(row))
    },

    // Rows the content health checker opens on disk. Rejected uploads are
    // excluded because their files are already unreachable by design, so a
    // missing one is the system working; approved and pending are both worth
    // checking, the first because visitors can reach it and the second because
    // a moderator is about to decide on it.
    listUploadsForHealth: async (limit = 200) => {
      const result = await pool.query(
        `
          SELECT id, status, title, file_type, file_size, file_url, preview_url
          FROM community_uploads
          WHERE status IN ('approved', 'pending')
          ORDER BY
            CASE status WHEN 'approved' THEN 0 ELSE 1 END,
            created_at DESC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map((row) => ({
        fileSize: Number(row.file_size),
        fileType: row.file_type,
        fileUrl: row.file_url,
        id: row.id,
        previewUrl: row.preview_url,
        status: row.status,
        title: row.title,
      }))
    },

    // Reverse lookup used by the /uploads access gate: a file on disk only
    // reveals its moderation state through the row that points at it.
    getUploadByAssetUrl: async (assetUrl) => {
      const result = await pool.query(
        `
          SELECT id, user_id, status
          FROM community_uploads
          WHERE file_url = $1 OR preview_url = $1
          LIMIT 1
        `,
        [assetUrl],
      )

      return result.rows[0] || null
    },

    listPosts: async () => {
      const result = await pool.query(`
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        ORDER BY community_posts.created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => toCommunityPost(row))
    },

    getPost: async (id) => {
      const result = await pool.query(
        `
          SELECT
            community_posts.id,
            community_posts.topic,
            community_posts.title,
            community_posts.message,
            community_posts.created_at,
            community_posts.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM community_posts
          LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
          WHERE community_posts.id = $1
          LIMIT 1
        `,
        [id],
      )

      return result.rows[0] ? toCommunityPost(result.rows[0]) : null
    },

    listComments: async (postId, { sort = 'newest', viewerId = null } = {}) => {
      const orderBy =
        sort === 'top'
          ? 'like_count DESC, community_comments.created_at ASC'
          : 'community_comments.created_at ASC'

      const result = await pool.query(
        `
          SELECT
            community_comments.id,
            community_comments.post_id,
            community_comments.parent_id,
            community_comments.author,
            community_comments.message,
            community_comments.created_at,
            community_comments.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level,
            COALESCE(like_counts.count, 0) AS like_count,
            CASE WHEN viewer_likes.user_id IS NULL THEN false ELSE true END AS liked
          FROM community_comments
          LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
          LEFT JOIN (
            SELECT comment_id, count(*)::int AS count
            FROM community_comment_likes
            GROUP BY comment_id
          ) AS like_counts ON like_counts.comment_id = community_comments.id
          LEFT JOIN community_comment_likes AS viewer_likes
            ON viewer_likes.comment_id = community_comments.id
            AND viewer_likes.user_id = $2
          WHERE community_comments.post_id = $1
          ORDER BY ${orderBy}
          LIMIT 500
        `,
        [postId, viewerId],
      )

      return result.rows.map(toCommunityComment)
    },

    createComment: async (comment) => {
      await pool.query(
        `
          INSERT INTO community_comments (id, post_id, parent_id, user_id, author, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          comment.id,
          comment.postId,
          comment.parentId || null,
          comment.userId || null,
          comment.author,
          comment.message,
        ],
      )

      const enriched = await pool.query(
        `
          SELECT
            community_comments.id,
            community_comments.post_id,
            community_comments.parent_id,
            community_comments.author,
            community_comments.message,
            community_comments.created_at,
            community_comments.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level,
            0 AS like_count,
            false AS liked
          FROM community_comments
          LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
          WHERE community_comments.id = $1
        `,
        [comment.id],
      )

      return toCommunityComment(enriched.rows[0])
    },

    deleteUserComment: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_comments
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [id, userId],
      )

      return result.rows[0] || null
    },

    toggleCommentLike: async (commentId, userId) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        const existing = await client.query(
          `
            SELECT id FROM community_comments WHERE id = $1
          `,
          [commentId],
        )

        if (!existing.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }

        const deleted = await client.query(
          `
            DELETE FROM community_comment_likes
            WHERE comment_id = $1 AND user_id = $2
            RETURNING comment_id
          `,
          [commentId, userId],
        )

        const liked = deleted.rowCount === 0

        if (liked) {
          await client.query(
            `
              INSERT INTO community_comment_likes (comment_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [commentId, userId],
          )
        }

        const countResult = await client.query(
          'SELECT count(*)::int AS count FROM community_comment_likes WHERE comment_id = $1',
          [commentId],
        )
        await client.query('COMMIT')

        return { liked, likeCount: countResult.rows[0].count }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    listUserUploads: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_uploads.id,
            community_uploads.status,
            community_uploads.title,
            community_uploads.description,
            community_uploads.asset_category,
            community_uploads.file_name,
            community_uploads.file_type,
            community_uploads.file_size,
            community_uploads.file_url,
            community_uploads.preview_url,
            community_uploads.created_at,
            community_uploads.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM community_uploads
          LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
          WHERE community_uploads.user_id = $1
          ORDER BY community_uploads.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => toCommunityUpload(row))
    },

    listUserPosts: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_posts.id,
            community_posts.topic,
            community_posts.title,
            community_posts.message,
            community_posts.created_at,
            community_posts.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM community_posts
          LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
          WHERE community_posts.user_id = $1
          ORDER BY community_posts.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => toCommunityPost(row))
    },

    listPublicUserUploads: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_uploads.id,
            community_uploads.status,
            community_uploads.title,
            community_uploads.description,
            community_uploads.asset_category,
            community_uploads.file_name,
            community_uploads.file_type,
            community_uploads.file_size,
            community_uploads.file_url,
            community_uploads.preview_url,
            community_uploads.created_at,
            community_uploads.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM community_uploads
          LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
          WHERE community_uploads.user_id = $1
            AND community_uploads.status = 'approved'
          ORDER BY community_uploads.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => toCommunityUpload(row))
    },

    listPublicUserPosts: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_posts.id,
            community_posts.topic,
            community_posts.title,
            community_posts.message,
            community_posts.created_at,
            community_posts.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM community_posts
          LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
          WHERE community_posts.user_id = $1
          ORDER BY community_posts.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => toCommunityPost(row))
    },

    listPublicUserComments: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            project_comments.id,
            project_comments.project_slug,
            project_comments.author,
            project_comments.message,
            project_comments.created_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level
          FROM project_comments
          LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
          WHERE project_comments.user_id = $1
          ORDER BY project_comments.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map((row) => toComment(row))
    },

    createUpload: async (upload) => {
      const result = await pool.query(
        `
          INSERT INTO community_uploads
            (
              id,
              status,
              user_id,
              title,
              description,
              asset_category,
              file_name,
              file_type,
              file_size,
              file_url,
              preview_url
            )
          VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING
            id,
            status,
            title,
            description,
            asset_category,
            file_name,
            file_type,
            file_size,
            file_url,
            preview_url,
            created_at,
            updated_at,
            user_id
        `,
        [
          upload.id,
          upload.userId,
          upload.title,
          upload.description,
          upload.assetCategory,
          upload.fileName,
          upload.fileType,
          upload.fileSize,
          upload.fileUrl,
          upload.previewUrl,
        ],
      )

      return toCommunityUpload({
        ...result.rows[0],
        access_level: upload.user.accessLevel,
        display_name: upload.user.displayName,
        email: upload.user.email,
        user_id: upload.user.id,
      })
    },

    createPost: async (post) => {
      const result = await pool.query(
        `
          INSERT INTO community_posts (id, user_id, topic, title, message)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, user_id, topic, title, message, created_at, updated_at
        `,
        [post.id, post.userId, post.topic, post.title, post.message],
      )

      return toCommunityPost({
        ...result.rows[0],
        access_level: post.user.accessLevel,
        display_name: post.user.displayName,
        email: post.user.email,
        user_id: post.user.id,
      })
    },

    deleteUserUpload: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_uploads
          WHERE id = $1 AND user_id = $2
          RETURNING id, file_url
        `,
        [id, userId],
      )

      return result.rows[0] || null
    },

    deleteUserPost: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_posts
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [id, userId],
      )

      return result.rows[0] || null
    },
  }

  const adminStore = {
    getSummary: async () => {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM project_comments) AS comments,
          (SELECT count(*)::int FROM project_likes) AS likes,
          (SELECT count(*)::int FROM download_requests) AS download_requests,
          (SELECT count(*)::int FROM download_requests WHERE status = 'pending') AS pending_downloads,
          (SELECT count(*)::int FROM contact_messages) AS contact_messages,
          (SELECT count(*)::int FROM visitor_users) AS visitors,
          (SELECT count(*)::int FROM community_posts) AS community_posts,
          (SELECT count(*)::int FROM community_comments) AS community_comments,
          (SELECT count(*)::int FROM community_uploads) AS community_uploads,
          (SELECT count(*)::int FROM community_uploads WHERE status = 'pending') AS pending_community_uploads
      `)

      return result.rows[0]
    },

    // Everything the dashboard needs, in one round trip. getSummary answers
    // "how many are there"; this answers "what is happening" -- the same
    // counters plus their movement against the previous window of equal
    // length, a daily series to plot, the queues that need a human, and the
    // few numbers that say whether the box itself is healthy.
    //
    // Deliberately one endpoint rather than a dozen: the dashboard is a single
    // view that either loads or does not, and eleven parallel requests over a
    // 100ms link is the difference between a dashboard and a progress bar.
    getOverview: async ({ days = 30 } = {}) => {
      // Clamped, not trusted: `days` reaches the SQL as an interval and as a
      // generate_series bound, so an absurd value is a slow query, not a
      // wrong answer.
      const span = Math.min(365, Math.max(1, Math.trunc(Number(days) || 30)))

      const [totals, series, queues, projects, feed, health] = await Promise.all([
        // Every counter, its movement this window, and the same window before
        // it -- one pass per table instead of three round trips per metric.
        pool.query(
          `
          WITH bounds AS (
            SELECT now() - make_interval(days => $1::int) AS window_start,
                   now() - make_interval(days => $1::int * 2) AS prior_start
          ),
          events AS (
            SELECT 'comments' AS metric, created_at FROM project_comments
            UNION ALL SELECT 'likes', created_at FROM project_likes
            UNION ALL SELECT 'downloadRequests', created_at FROM download_requests
            UNION ALL SELECT 'downloads', created_at FROM download_events
            UNION ALL SELECT 'members', created_at FROM visitor_users
            UNION ALL SELECT 'communityPosts', created_at FROM community_posts
            UNION ALL SELECT 'communityComments', created_at FROM community_comments
            UNION ALL SELECT 'communityUploads', created_at FROM community_uploads
            UNION ALL SELECT 'messages', created_at FROM contact_messages
          )
          SELECT
            events.metric,
            count(*)::int AS total,
            count(*) FILTER (WHERE events.created_at >= bounds.window_start)::int AS current,
            count(*) FILTER (
              WHERE events.created_at >= bounds.prior_start
                AND events.created_at < bounds.window_start
            )::int AS prior
          FROM events, bounds
          GROUP BY events.metric
        `,
          [span],
        ),

        // One row per calendar day in the window, zeros included. Days with no
        // activity have to be in the result or the chart draws a flat line
        // through a gap and quietly invents traffic that never happened.
        pool.query(
          `
          WITH days AS (
            SELECT generate_series(
              ((now() AT TIME ZONE 'UTC')::date - ($1::int - 1))::timestamp,
              ((now() AT TIME ZONE 'UTC')::date)::timestamp,
              interval '1 day'
            )::date AS day
          ),
          events AS (
            SELECT 'comments' AS metric, (created_at AT TIME ZONE 'UTC')::date AS day
              FROM project_comments
            UNION ALL SELECT 'likes', (created_at AT TIME ZONE 'UTC')::date FROM project_likes
            UNION ALL SELECT 'downloads', (created_at AT TIME ZONE 'UTC')::date FROM download_events
            UNION ALL SELECT 'members', (created_at AT TIME ZONE 'UTC')::date FROM visitor_users
            UNION ALL SELECT 'community', (created_at AT TIME ZONE 'UTC')::date
              FROM community_uploads
            UNION ALL SELECT 'community', (created_at AT TIME ZONE 'UTC')::date
              FROM community_posts
            UNION ALL SELECT 'messages', (created_at AT TIME ZONE 'UTC')::date
              FROM contact_messages
          )
          SELECT
            days.day,
            count(*) FILTER (WHERE events.metric = 'comments')::int AS comments,
            count(*) FILTER (WHERE events.metric = 'likes')::int AS likes,
            count(*) FILTER (WHERE events.metric = 'downloads')::int AS downloads,
            count(*) FILTER (WHERE events.metric = 'members')::int AS members,
            count(*) FILTER (WHERE events.metric = 'community')::int AS community,
            count(*) FILTER (WHERE events.metric = 'messages')::int AS messages
          FROM days
          LEFT JOIN events ON events.day = days.day
          GROUP BY days.day
          ORDER BY days.day
        `,
          [span],
        ),

        // The work queues. Each carries the age of its oldest item, because
        // "3 pending" and "3 pending, oldest 11 days" are different problems.
        pool.query(`
          SELECT
            (SELECT count(*)::int FROM project_comments WHERE status = 'pending') AS pending_comments,
            (SELECT min(created_at) FROM project_comments WHERE status = 'pending') AS oldest_comment,
            (SELECT count(*)::int FROM project_comments WHERE status = 'spam') AS spam_comments,
            (SELECT count(*)::int FROM community_uploads WHERE status = 'pending') AS pending_uploads,
            (SELECT min(created_at) FROM community_uploads WHERE status = 'pending') AS oldest_upload,
            (SELECT count(*)::int FROM download_requests WHERE status = 'pending') AS pending_requests,
            (SELECT min(created_at) FROM download_requests WHERE status = 'pending') AS oldest_request,
            (SELECT count(*)::int FROM contact_messages
              WHERE created_at >= now() - interval '7 days') AS recent_messages,
            (SELECT min(created_at) FROM contact_messages
              WHERE created_at >= now() - interval '7 days') AS oldest_message,
            (SELECT count(*)::int FROM visitor_users WHERE email_verified_at IS NULL) AS unverified_members,
            (SELECT count(*)::int FROM visitor_users WHERE profile_admin_disabled) AS disabled_profiles
        `),

        // Engagement per project. A download event is a completed transfer, not
        // a request, so this ranks what people actually took away.
        pool.query(`
          SELECT
            slug,
            sum(likes)::int AS likes,
            sum(comments)::int AS comments,
            sum(downloads)::int AS downloads
          FROM (
            SELECT project_slug AS slug, 1 AS likes, 0 AS comments, 0 AS downloads
              FROM project_likes
            UNION ALL SELECT project_slug, 0, 1, 0 FROM project_comments WHERE status <> 'spam'
            UNION ALL SELECT project_slug, 0, 0, 1 FROM download_events
          ) engagement
          GROUP BY slug
          ORDER BY sum(likes) + sum(comments) + sum(downloads) DESC, slug
          LIMIT 8
        `),

        // A merged timeline. Each source is capped before the union so one
        // chatty table cannot crowd the others out of the final window.
        pool.query(`
          SELECT * FROM (
            (SELECT 'comment' AS kind, project_comments.id, project_comments.created_at,
                    project_comments.project_slug AS context,
                    coalesce(visitor_users.display_name, project_comments.author) AS actor,
                    project_comments.message AS detail,
                    project_comments.status
               FROM project_comments
               LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
              ORDER BY project_comments.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'upload', community_uploads.id, community_uploads.created_at,
                    coalesce(community_uploads.asset_category, 'asset'),
                    coalesce(visitor_users.display_name, 'Someone'),
                    community_uploads.title, community_uploads.status
               FROM community_uploads
               LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
              ORDER BY community_uploads.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'post', community_posts.id, community_posts.created_at,
                    community_posts.topic,
                    coalesce(visitor_users.display_name, 'Someone'),
                    community_posts.title, 'published'
               FROM community_posts
               LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
              ORDER BY community_posts.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'member', id, created_at, coalesce(access_level, 'member'), display_name,
                    CASE WHEN email_verified_at IS NULL THEN 'awaiting verification'
                         ELSE 'verified' END,
                    'joined'
               FROM visitor_users ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'request', id, created_at, project_slug, name, purpose, status
               FROM download_requests ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'message', id, created_at, 'contact', name, message, 'received'
               FROM contact_messages ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'download', download_events.id, download_events.created_at,
                    download_events.project_slug,
                    coalesce(visitor_users.display_name, download_events.actor),
                    'downloaded the source archive', 'completed'
               FROM download_events
               LEFT JOIN visitor_users ON visitor_users.id = download_events.user_id
              ORDER BY download_events.created_at DESC LIMIT 12)
          ) timeline
          ORDER BY created_at DESC
          LIMIT 20
        `),

        // Standing figures that are not events: catalogue size, storage, and
        // how much of the member base is real (verified) and awake (recent).
        pool.query(`
          SELECT
            (SELECT coalesce(sum(file_size), 0)::bigint FROM community_uploads) AS upload_bytes,
            (SELECT coalesce(sum(file_size), 0)::bigint FROM community_uploads
              WHERE status = 'approved') AS approved_bytes,
            (SELECT count(*)::int FROM custom_projects) AS custom_projects,
            (SELECT count(*)::int FROM project_overrides WHERE is_public = false) AS hidden_projects,
            (SELECT count(*)::int FROM visitor_users WHERE email_verified_at IS NOT NULL)
              AS verified_members,
            (SELECT count(*)::int FROM visitor_users
              WHERE last_login_at >= now() - interval '30 days') AS active_members,
            (SELECT count(*)::int FROM visitor_users WHERE profile_public IS NOT false)
              AS public_profiles,
            (SELECT count(*)::int FROM admin_sessions WHERE expires_at > now())
              AS active_admin_sessions,
            (SELECT count(*)::int FROM admin_users WHERE disabled_at IS NULL) AS admin_accounts,
            (SELECT count(*)::int FROM admin_users
              WHERE disabled_at IS NULL AND totp_confirmed_at IS NULL) AS admins_without_totp,
            (SELECT max(created_at) FROM admin_user_actions) AS last_admin_action
        `),
      ])

      const metrics = {}
      for (const row of totals.rows) {
        metrics[row.metric] = { current: row.current, prior: row.prior, total: row.total }
      }

      const iso = (value) => (value ? value.toISOString() : null)
      const queue = queues.rows[0] || {}
      const standing = health.rows[0] || {}

      return {
        activity: feed.rows.map((row) => ({
          actor: row.actor || '',
          context: row.context || '',
          createdAt: row.created_at.toISOString(),
          detail: row.detail || '',
          id: `${row.kind}-${row.id}`,
          kind: row.kind,
          status: row.status || '',
        })),
        catalogue: {
          adminAccounts: standing.admin_accounts ?? 0,
          adminsWithoutTotp: standing.admins_without_totp ?? 0,
          activeAdminSessions: standing.active_admin_sessions ?? 0,
          activeMembers: standing.active_members ?? 0,
          approvedBytes: Number(standing.approved_bytes ?? 0),
          customProjects: standing.custom_projects ?? 0,
          hiddenProjects: standing.hidden_projects ?? 0,
          lastAdminAction: iso(standing.last_admin_action),
          publicProfiles: standing.public_profiles ?? 0,
          uploadBytes: Number(standing.upload_bytes ?? 0),
          verifiedMembers: standing.verified_members ?? 0,
        },
        metrics,
        queues: {
          disabledProfiles: queue.disabled_profiles ?? 0,
          oldestComment: iso(queue.oldest_comment),
          oldestMessage: iso(queue.oldest_message),
          oldestRequest: iso(queue.oldest_request),
          oldestUpload: iso(queue.oldest_upload),
          pendingComments: queue.pending_comments ?? 0,
          pendingRequests: queue.pending_requests ?? 0,
          pendingUploads: queue.pending_uploads ?? 0,
          recentMessages: queue.recent_messages ?? 0,
          spamComments: queue.spam_comments ?? 0,
          unverifiedMembers: queue.unverified_members ?? 0,
        },
        range: { days: span },
        series: series.rows.map((row) => ({
          comments: row.comments,
          community: row.community,
          day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
          downloads: row.downloads,
          likes: row.likes,
          members: row.members,
          messages: row.messages,
        })),
        topProjects: projects.rows.map((row) => ({
          comments: row.comments,
          downloads: row.downloads,
          likes: row.likes,
          slug: row.slug,
          total: row.likes + row.comments + row.downloads,
        })),
      }
    },

    // `status` filters the moderation queue; omitting it lists everything, so
    // the existing admin comments view keeps working unchanged.
    listComments: async ({ status = '' } = {}) => {
      const result = await pool.query(
        `
        SELECT
          project_comments.id,
          project_comments.project_slug,
          project_comments.author,
          project_comments.message,
          project_comments.created_at,
          project_comments.status,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM project_comments
        LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
        WHERE ($1::text = '' OR project_comments.status = $1)
        ORDER BY project_comments.created_at DESC
        LIMIT 100
      `,
        [status],
      )

      return result.rows.map((row) => ({
        ...toComment(row, { includeEmail: true }),
        status: row.status,
      }))
    },

    setCommentStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE project_comments
          SET status = $2,
              moderated_at = now()
          WHERE id = $1
          RETURNING id, status
        `,
        [id, status],
      )

      return result.rows[0] || null
    },

    listCommunityUploads: async () => {
      const result = await pool.query(`
        SELECT
          community_uploads.id,
          community_uploads.status,
          community_uploads.title,
          community_uploads.description,
          community_uploads.asset_category,
          community_uploads.file_name,
          community_uploads.file_type,
          community_uploads.file_size,
          community_uploads.file_url,
          community_uploads.preview_url,
          community_uploads.created_at,
          community_uploads.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        ORDER BY
          CASE community_uploads.status
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            ELSE 2
          END,
          community_uploads.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => toCommunityUpload(row, { includeEmail: true }))
    },

    listCommunityPosts: async () => {
      const result = await pool.query(`
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        ORDER BY community_posts.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => toCommunityPost(row, { includeEmail: true }))
    },

    listCommunityComments: async () => {
      const result = await pool.query(`
        SELECT
          community_comments.id,
          community_comments.post_id,
          community_comments.parent_id,
          community_comments.author,
          community_comments.message,
          community_comments.created_at,
          community_comments.updated_at,
          community_posts.title AS post_title,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level,
          COALESCE(like_counts.count, 0) AS like_count,
          false AS liked
        FROM community_comments
        LEFT JOIN community_posts ON community_posts.id = community_comments.post_id
        LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
        LEFT JOIN (
          SELECT comment_id, count(*)::int AS count
          FROM community_comment_likes
          GROUP BY comment_id
        ) AS like_counts ON like_counts.comment_id = community_comments.id
        ORDER BY community_comments.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        ...toCommunityComment(row),
        postTitle: row.post_title || null,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.email,
              id: row.user_id,
            }
          : null,
      }))
    },

    listLikes: async () => {
      const result = await pool.query(`
        SELECT
          project_likes.project_slug,
          project_likes.visitor_id,
          project_likes.created_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM project_likes
        LEFT JOIN visitor_users ON visitor_users.id = project_likes.user_id
        ORDER BY project_likes.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        projectSlug: row.project_slug,
        visitorId: row.visitor_id,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.email,
              id: row.user_id,
            }
          : null,
        createdAt: row.created_at.toISOString(),
      }))
    },

    listContactMessages: async () => {
      const result = await pool.query(`
        SELECT id, name, email, message, created_at
        FROM contact_messages
        ORDER BY created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        message: row.message,
        createdAt: row.created_at.toISOString(),
      }))
    },

    listDownloadRequests: async () => {
      const result = await pool.query(`
        SELECT
          download_requests.id,
          download_requests.status,
          download_requests.project_slug,
          download_requests.project_title,
          download_requests.name,
          download_requests.email,
          download_requests.purpose,
          download_requests.ip,
          download_requests.visitor_access_level,
          download_requests.created_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email AS user_email,
          visitor_users.access_level
        FROM download_requests
        LEFT JOIN visitor_users ON visitor_users.id = download_requests.user_id
        ORDER BY download_requests.created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        projectSlug: row.project_slug,
        projectTitle: row.project_title,
        name: row.name,
        email: row.email,
        purpose: row.purpose,
        ip: row.ip,
        visitorAccessLevel: row.visitor_access_level,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.user_email,
              id: row.user_id,
            }
          : null,
        createdAt: row.created_at.toISOString(),
      }))
    },

    listVisitors: async ({
      accessLevel,
      limit,
      offset,
      profileStatus,
      query,
      sort,
      verified,
    }) => {
      const values = []
      const conditions = []
      const addValue = (value) => {
        values.push(value)
        return `$${values.length}`
      }

      if (query) {
        const placeholder = addValue(`%${query}%`)
        conditions.push(
          `(visitor_users.email ILIKE ${placeholder} OR visitor_users.display_name ILIKE ${placeholder} OR visitor_users.handle ILIKE ${placeholder})`,
        )
      }
      if (verified === true) conditions.push('visitor_users.email_verified_at IS NOT NULL')
      if (verified === false) conditions.push('visitor_users.email_verified_at IS NULL')
      if (accessLevel) conditions.push(`visitor_users.access_level = ${addValue(accessLevel)}`)
      if (profileStatus === 'disabled') {
        conditions.push('visitor_users.profile_admin_disabled = true')
      } else if (profileStatus === 'public') {
        conditions.push(
          'visitor_users.profile_public = true AND visitor_users.profile_admin_disabled = false',
        )
      } else if (profileStatus === 'private') {
        conditions.push(
          'visitor_users.profile_public = false AND visitor_users.profile_admin_disabled = false',
        )
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const orderBy = {
        createdAt: 'visitor_users.created_at DESC',
        displayName: 'visitor_users.display_name ASC',
        lastLoginAt: 'visitor_users.last_login_at DESC NULLS LAST',
        updatedAt: 'visitor_users.updated_at DESC',
      }[sort] || 'visitor_users.created_at DESC'
      const countResult = await pool.query(
        `SELECT count(*)::int AS count FROM visitor_users ${where}`,
        values,
      )
      const limitPlaceholder = addValue(limit)
      const offsetPlaceholder = addValue(offset)
      const result = await pool.query(
        `
          SELECT
            visitor_users.*,
            (
              (SELECT count(*)::int FROM project_comments WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comments WHERE user_id = visitor_users.id)
            ) AS comment_count,
            (SELECT count(*)::int FROM community_posts WHERE user_id = visitor_users.id) AS post_count,
            (SELECT count(*)::int FROM community_uploads WHERE user_id = visitor_users.id) AS upload_count,
            (SELECT count(*)::int FROM download_requests WHERE user_id = visitor_users.id)
              AS download_request_count
          FROM visitor_users
          ${where}
          ORDER BY ${orderBy}
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        values,
      )

      return {
        items: result.rows.map((row) => ({
          ...toAccountProfile(row),
          profileAdminDisabledReason: undefined,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    getVisitor: async (id) => {
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
        [id],
      )
      const visitor = toAccountProfile(result.rows[0])
      if (!visitor) return null
      return {
        ...visitor,
        profileAdminDisableReason: result.rows[0].profile_admin_disable_reason || '',
        profileModeratedAt:
          result.rows[0].profile_moderated_at?.toISOString?.() ||
          result.rows[0].profile_moderated_at ||
          null,
      }
    },

    listVisitorActions: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, visitor_user_id, action, fields, reason, created_at
            FROM admin_user_actions
            WHERE visitor_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query(
          'SELECT count(*)::int AS count FROM admin_user_actions WHERE visitor_user_id = $1',
          [id],
        ),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          action: row.action,
          createdAt: row.created_at.toISOString(),
          fields: row.fields || [],
          id: row.id,
          reason: row.reason || '',
          visitorUserId: row.visitor_user_id,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorComments: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT *
            FROM (
              SELECT id, 'project' AS source, project_slug AS context_id, null::text AS context_title,
                author, message, created_at, created_at AS updated_at
              FROM project_comments
              WHERE user_id = $1
              UNION ALL
              SELECT community_comments.id, 'community' AS source,
                community_comments.post_id AS context_id, community_posts.title AS context_title,
                community_comments.author, community_comments.message,
                community_comments.created_at, community_comments.updated_at
              FROM community_comments
              LEFT JOIN community_posts ON community_posts.id = community_comments.post_id
              WHERE community_comments.user_id = $1
            ) AS comments
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query(
          `
            SELECT (
              (SELECT count(*) FROM project_comments WHERE user_id = $1) +
              (SELECT count(*) FROM community_comments WHERE user_id = $1)
            )::int AS count
          `,
          [id],
        ),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          author: row.author,
          contextId: row.context_id,
          contextTitle: row.context_title,
          createdAt: row.created_at.toISOString(),
          id: row.id,
          message: row.message,
          source: row.source,
          updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorPosts: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, topic, title, message, created_at, updated_at
            FROM community_posts
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM community_posts WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          id: row.id,
          message: row.message,
          title: row.title,
          topic: row.topic,
          updatedAt: row.updated_at.toISOString(),
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorUploads: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, status, title, description, asset_category, file_name, file_type,
              file_size, file_url, preview_url, created_at, updated_at
            FROM community_uploads
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM community_uploads WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => toCommunityUpload(row, { includeEmail: true })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorDownloadRequests: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, status, project_slug, project_title, name, email, purpose, ip,
              visitor_access_level, created_at
            FROM download_requests
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM download_requests WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          email: row.email,
          id: row.id,
          ip: row.ip,
          name: row.name,
          projectSlug: row.project_slug,
          projectTitle: row.project_title,
          purpose: row.purpose,
          status: row.status,
          visitorAccessLevel: row.visitor_access_level,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    // `actor` is the admin_users row id of whoever is making the change, or
    // null when the call arrived on the shared static token. It is written into
    // the audit row rather than inferred afterwards, because "who did this" is
    // not recoverable after the fact.
    setVisitorProfileVisibility: async (id, disabled, reason, actor = null) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `
            UPDATE visitor_users
            SET profile_admin_disabled = $2,
                profile_admin_disabled_at = CASE WHEN $2 THEN now() ELSE null END,
                profile_admin_disable_reason = CASE WHEN $2 THEN $3 ELSE null END,
                profile_moderated_at = now(),
                updated_at = now()
            WHERE id = $1
            RETURNING id
          `,
          [id, disabled, reason || null],
        )
        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        await client.query(
          `
            INSERT INTO admin_user_actions (id, visitor_user_id, action, fields, reason, actor_admin_user_id)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
          `,
          [
            createId(),
            id,
            disabled ? 'profile_disabled' : 'profile_restored',
            JSON.stringify(['profile']),
            reason || null,
            actor,
          ],
        )
        await client.query('COMMIT')
        return adminStore.getVisitor(id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    moderateVisitorProfile: async (id, fields, reason, actor = null) => {
      const assignments = []
      if (fields.includes('avatar')) assignments.push("avatar_url = ''")
      if (fields.includes('banner')) assignments.push("banner_url = ''")
      if (fields.includes('bio')) assignments.push("bio = ''")
      if (fields.includes('contacts')) {
        assignments.push("public_email = ''", "contact_links = '{}'::jsonb", 'contacts_public = false')
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `
            UPDATE visitor_users
            SET ${assignments.join(', ')},
                profile_moderated_at = now(),
                updated_at = now()
            WHERE id = $1
            RETURNING id
          `,
          [id],
        )
        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        await client.query(
          `
            INSERT INTO admin_user_actions (id, visitor_user_id, action, fields, reason, actor_admin_user_id)
            VALUES ($1, $2, 'profile_fields_cleared', $3::jsonb, $4, $5)
          `,
          [createId(), id, JSON.stringify(fields), reason || null, actor],
        )
        await client.query('COMMIT')
        return adminStore.getVisitor(id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    updateVisitorAccessLevel: async (id, accessLevel) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET access_level = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id, accessLevel],
      )

      return toAccountUserRecord(result.rows[0])
    },

    setVisitorEmailVerified: async (id, verified) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET email_verified_at = CASE WHEN $2 THEN COALESCE(email_verified_at, now()) ELSE null END,
              verification_code_hash = CASE WHEN $2 THEN null ELSE verification_code_hash END,
              verification_expires_at = CASE WHEN $2 THEN null ELSE verification_expires_at END,
              updated_at = now()
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id, verified],
      )

      return toAccountUserRecord(result.rows[0])
    },

    deleteVisitor: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM visitor_users
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id],
      )

      return toAccountUserRecord(result.rows[0])
    },

    // Returns the requester's contact details alongside the new status so the
    // caller can notify them. Before this, a decision was invisible unless the
    // requester happened to revisit /account.
    updateDownloadRequestStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE download_requests
          SET status = $2,
              decided_at = now()
          WHERE id = $1
          RETURNING id, status, name, email, project_slug, project_title, user_id
        `,
        [id, status],
      )

      const row = result.rows[0]
      if (!row) return null

      return {
        email: row.email,
        id: row.id,
        name: row.name,
        projectSlug: row.project_slug,
        projectTitle: row.project_title,
        status: row.status,
        userId: row.user_id,
      }
    },

    markDownloadRequestNotified: async (id) => {
      await pool.query('UPDATE download_requests SET notified_at = now() WHERE id = $1', [id])
    },

    listDownloadEvents: async (limit = 100) => {
      const result = await pool.query(
        `
          SELECT
            download_events.id,
            download_events.project_slug,
            download_events.actor,
            download_events.ip,
            download_events.created_at,
            visitor_users.display_name,
            visitor_users.id AS user_id
          FROM download_events
          LEFT JOIN visitor_users ON visitor_users.id = download_events.user_id
          ORDER BY download_events.created_at DESC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map((row) => ({
        actor: row.actor,
        createdAt: row.created_at.toISOString(),
        id: row.id,
        ip: row.ip,
        projectSlug: row.project_slug,
        user: row.user_id ? { displayName: row.display_name, id: row.user_id } : null,
      }))
    },

    // ---------------------------------------------------------------------
    // Admin sessions. See the admin_sessions comment in ensureSchema for why
    // the permanent static token had to stop being the thing the browser
    // holds on to.
    // ---------------------------------------------------------------------

    createAdminSession: async ({ adminUserId, expiresAt, ip, tokenHash, userAgent }) => {
      await pool.query(
        `
          INSERT INTO admin_sessions (token_hash, ip, user_agent, expires_at, last_seen_at, admin_user_id)
          VALUES ($1, $2, $3, $4, now(), $5)
        `,
        [tokenHash, ip || null, userAgent || null, expiresAt, adminUserId || null],
      )
    },

    // Resolves the session and the person behind it in one round trip, and
    // refuses a session whose account has since been disabled -- otherwise
    // disabling an admin would leave them working normally for up to
    // ADMIN_SESSION_HOURS, which is not what anyone means by "disable".
    getAdminSession: async (tokenHash) => {
      const result = await pool.query(
        `
          UPDATE admin_sessions
          SET last_seen_at = now()
          WHERE token_hash = $1
            AND expires_at > now()
            AND (
              admin_user_id IS NULL
              OR EXISTS (
                SELECT 1 FROM admin_users
                WHERE admin_users.id = admin_sessions.admin_user_id
                  AND admin_users.disabled_at IS NULL
              )
            )
          RETURNING expires_at, admin_user_id
        `,
        [tokenHash],
      )

      const row = result.rows[0]
      if (!row) return null

      let username = null
      if (row.admin_user_id) {
        const owner = await pool.query('SELECT username FROM admin_users WHERE id = $1', [
          row.admin_user_id,
        ])
        username = owner.rows[0]?.username || null
      }

      return {
        adminUserId: row.admin_user_id || null,
        expiresAt: row.expires_at.toISOString(),
        username,
      }
    },

    deleteAdminSession: async (tokenHash) => {
      await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash])
    },

    deleteExpiredAdminSessions: async () => {
      const result = await pool.query('DELETE FROM admin_sessions WHERE expires_at <= now()')
      return result.rowCount
    },

    listAdminSessions: async () => {
      const result = await pool.query(
        `
          SELECT
            admin_sessions.ip,
            admin_sessions.user_agent,
            admin_sessions.expires_at,
            admin_sessions.last_seen_at,
            admin_sessions.created_at,
            admin_sessions.admin_user_id,
            admin_users.username
          FROM admin_sessions
          LEFT JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
          WHERE admin_sessions.expires_at > now()
          ORDER BY admin_sessions.created_at DESC
          LIMIT 50
        `,
      )

      return result.rows.map((row) => ({
        adminUserId: row.admin_user_id || null,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        ip: row.ip,
        lastSeenAt: row.last_seen_at?.toISOString?.() || null,
        // null means the session was minted from the shared static token. It is
        // shown as such rather than hidden: an unattributable session is the
        // thing an operator most wants to notice in this list.
        username: row.username || null,
        userAgent: row.user_agent,
      }))
    },

    // ---------------------------------------------------------------------
    // Admin accounts.
    //
    // The password/lockout halves deliberately mirror the visitor equivalents
    // above (pbkdf2 hash supplied by the caller, per-account failure counter),
    // because the attack is the same one and there is no reason for the admin
    // path to have its own subtly different rules.
    // ---------------------------------------------------------------------

    createAdminUser: async ({
      displayName,
      id,
      passwordHash,
      recoveryCodeHashes = [],
      totpSecret = null,
      username,
    }) => {
      const result = await pool.query(
        `
          INSERT INTO admin_users (
            id, username, display_name, password_hash, totp_secret, recovery_code_hashes
          )
          VALUES ($1, lower($2), $3, $4, $5, $6::jsonb)
          RETURNING id, username
        `,
        [
          id,
          username,
          displayName || null,
          passwordHash,
          totpSecret,
          JSON.stringify(recoveryCodeHashes),
        ],
      )

      return { id: result.rows[0].id, username: result.rows[0].username }
    },

    getAdminUserByUsername: async (username) => {
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE username = lower($1)',
        [String(username || '')],
      )
      return toAdminUser(result.rows[0])
    },

    getAdminUserById: async (id) => {
      const result = await pool.query('SELECT * FROM admin_users WHERE id = $1', [id])
      return toAdminUser(result.rows[0])
    },

    listAdminUsers: async () => {
      const result = await pool.query(
        `
          SELECT id, username, display_name, totp_confirmed_at, disabled_at, locked_until,
                 failed_login_count, last_login_at, created_at,
                 jsonb_array_length(recovery_code_hashes) AS recovery_codes_left
          FROM admin_users
          ORDER BY created_at
        `,
      )

      return result.rows.map((row) => ({
        createdAt: row.created_at.toISOString(),
        disabledAt: row.disabled_at?.toISOString?.() || null,
        displayName: row.display_name,
        failedLoginCount: row.failed_login_count,
        id: row.id,
        lastLoginAt: row.last_login_at?.toISOString?.() || null,
        lockedUntil: row.locked_until?.toISOString?.() || null,
        recoveryCodesLeft: row.recovery_codes_left,
        totpConfirmedAt: row.totp_confirmed_at?.toISOString?.() || null,
        username: row.username,
      }))
    },

    setAdminUserPassword: async (id, passwordHash) => {
      await pool.query(
        `
          UPDATE admin_users
          SET password_hash = $2,
              failed_login_count = 0,
              locked_until = null,
              updated_at = now()
          WHERE id = $1
        `,
        [id, passwordHash],
      )
    },

    // Enrolment is two-phase on purpose: the secret is stored unconfirmed, and
    // only a code the account holder actually produced flips totp_confirmed_at.
    // Confirming on write instead would let a mistyped secret lock the account
    // out of its own second factor.
    setAdminUserTotpSecret: async (id, { recoveryCodeHashes, totpSecret }) => {
      await pool.query(
        `
          UPDATE admin_users
          SET totp_secret = $2,
              totp_confirmed_at = null,
              totp_last_step = 0,
              recovery_code_hashes = COALESCE($3::jsonb, recovery_code_hashes),
              updated_at = now()
          WHERE id = $1
        `,
        [id, totpSecret, recoveryCodeHashes ? JSON.stringify(recoveryCodeHashes) : null],
      )
    },

    // Parks a candidate secret next to the live one. Each call overwrites the
    // previous candidate, so an abandoned enrolment cannot be resumed later
    // with a stale QR code that is still sitting in someone's scrollback.
    startAdminUserTotpEnrolment: async (id, { expiresAt, totpSecret }) => {
      await pool.query(
        `
          UPDATE admin_users
          SET pending_totp_secret = $2,
              pending_totp_expires_at = $3,
              updated_at = now()
          WHERE id = $1
        `,
        [id, totpSecret, expiresAt],
      )
    },

    // The promotion is one statement, guarded on the candidate still being
    // present and unexpired. Reading, checking and writing separately would let
    // two confirmations race, and the loser would silently install a secret the
    // winner had already replaced. Returns false when there was nothing valid
    // to promote, which the caller reports as "start the enrolment again".
    confirmAdminUserTotpEnrolment: async (id, { recoveryCodeHashes, step }) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET totp_secret = pending_totp_secret,
              totp_confirmed_at = now(),
              totp_last_step = $2::bigint,
              recovery_code_hashes = $3::jsonb,
              pending_totp_secret = null,
              pending_totp_expires_at = null,
              failed_login_count = 0,
              locked_until = null,
              updated_at = now()
          WHERE id = $1
            AND pending_totp_secret IS NOT NULL
            AND pending_totp_expires_at > now()
          RETURNING id
        `,
        [id, String(step), JSON.stringify(recoveryCodeHashes)],
      )
      return Boolean(result.rows[0])
    },

    cancelAdminUserTotpEnrolment: async (id) => {
      await pool.query(
        `
          UPDATE admin_users
          SET pending_totp_secret = null,
              pending_totp_expires_at = null,
              updated_at = now()
          WHERE id = $1
        `,
        [id],
      )
    },

    confirmAdminUserTotp: async (id, step) => {
      await pool.query(
        `
          UPDATE admin_users
          SET totp_confirmed_at = COALESCE(totp_confirmed_at, now()),
              totp_last_step = GREATEST(totp_last_step, $2::bigint),
              updated_at = now()
          WHERE id = $1
        `,
        [id, String(step)],
      )
    },

    // Conditional on the step still being unused, so two requests racing with
    // the same code cannot both win: the second UPDATE matches zero rows.
    consumeAdminUserTotpStep: async (id, step) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET totp_last_step = $2::bigint,
              updated_at = now()
          WHERE id = $1
            AND totp_last_step < $2::bigint
          RETURNING id
        `,
        [id, String(step)],
      )
      return Boolean(result.rows[0])
    },

    // Removes the matching hash and reports whether it was there, in one
    // statement, so a recovery code cannot be spent twice by two racing
    // requests.
    consumeAdminRecoveryCode: async (id, codeHash) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET recovery_code_hashes = recovery_code_hashes - $2::text,
              updated_at = now()
          WHERE id = $1
            AND recovery_code_hashes ? $2::text
          RETURNING jsonb_array_length(recovery_code_hashes) AS remaining
        `,
        [id, codeHash],
      )

      const row = result.rows[0]
      return row ? { ok: true, remaining: row.remaining } : { ok: false, remaining: null }
    },

    replaceAdminRecoveryCodes: async (id, codeHashes) => {
      await pool.query(
        `
          UPDATE admin_users
          SET recovery_code_hashes = $2::jsonb,
              updated_at = now()
          WHERE id = $1
        `,
        [id, JSON.stringify(codeHashes)],
      )
    },

    setAdminUserDisabled: async (id, disabled) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE null END,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [id, disabled],
      )

      if (!result.rows[0]) return false

      // A disabled account keeps no live sessions. getAdminSession already
      // refuses them, but leaving the rows around makes GET /api/admin/sessions
      // lie about who is currently able to act.
      if (disabled) {
        await pool.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [id])
      }

      return true
    },

    registerAdminLoginFailure: async (id, { lockAfter, lockMs }) => {
      const result = await pool.query(
        `
          UPDATE admin_users
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
        [id, lockAfter, lockMs],
      )

      const row = result.rows[0]
      if (!row) return { failedCount: 0, lockedUntil: null }

      return {
        failedCount: row.failed_login_count,
        lockedUntil: row.locked_until?.toISOString?.() || null,
      }
    },

    registerAdminLoginSuccess: async (id) => {
      await pool.query(
        `
          UPDATE admin_users
          SET failed_login_count = 0,
              locked_until = null,
              last_login_at = now(),
              updated_at = now()
          WHERE id = $1
        `,
        [id],
      )
    },

    listAdminActions: async (limit = 50) => {
      const result = await pool.query(
        `
          SELECT
            admin_user_actions.id,
            admin_user_actions.action,
            admin_user_actions.fields,
            admin_user_actions.reason,
            admin_user_actions.created_at,
            admin_user_actions.visitor_user_id,
            admin_user_actions.actor_admin_user_id,
            admin_users.username AS actor_username,
            visitor_users.email AS target_email
          FROM admin_user_actions
          LEFT JOIN admin_users ON admin_users.id = admin_user_actions.actor_admin_user_id
          LEFT JOIN visitor_users ON visitor_users.id = admin_user_actions.visitor_user_id
          ORDER BY admin_user_actions.created_at DESC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map((row) => ({
        action: row.action,
        // null actor = taken with the shared static token, before named
        // accounts existed or by a script that still uses it.
        actorUsername: row.actor_username || null,
        createdAt: row.created_at.toISOString(),
        fields: row.fields,
        id: row.id,
        reason: row.reason,
        targetEmail: row.target_email || null,
        targetUserId: row.visitor_user_id || null,
      }))
    },

    updateCommunityUploadStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE community_uploads
          SET status = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [id, status],
      )

      if (!result.rows[0]) return null

      const updated = await pool.query(
        `
          SELECT
            community_uploads.id,
            community_uploads.status,
            community_uploads.title,
            community_uploads.description,
            community_uploads.asset_category,
            community_uploads.file_name,
            community_uploads.file_type,
            community_uploads.file_size,
            community_uploads.file_url,
            community_uploads.preview_url,
            community_uploads.created_at,
            community_uploads.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM community_uploads
          LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
          WHERE community_uploads.id = $1
        `,
        [id],
      )

      return toCommunityUpload(updated.rows[0], { includeEmail: true })
    },

    listProjects: async (baseProjects) =>
      projectStore.listProjects(baseProjects, { includeHidden: true }),

    updateProject: async (slug, project) => {
      const customProject = await pool.query('SELECT slug FROM custom_projects WHERE slug = $1', [
        slug,
      ])

      if (customProject.rowCount > 0) {
        const result = await pool.query(
          `
            UPDATE custom_projects SET
              title = $2,
              summary = $3,
              workflow = $4,
              year = $5,
              image = $6,
              model_url = $7,
              format = $8,
              model_size = $9,
              asset_category = $10,
              download_policy = $11,
              stack = $12::jsonb,
              viewer_features = $13::jsonb,
              is_public = $14,
              title_zh = $15,
              title_en = $16,
              title_ja = $17,
              summary_zh = $18,
              summary_en = $19,
              summary_ja = $20,
              workflow_zh = $21,
              workflow_en = $22,
              workflow_ja = $23,
              format_zh = $24,
              format_en = $25,
              format_ja = $26,
              model_size_zh = $27,
              model_size_en = $28,
              model_size_ja = $29,
              download_policy_zh = $30,
              download_policy_en = $31,
              download_policy_ja = $32,
              updated_at = now()
            WHERE slug = $1
            RETURNING slug
          `,
          [
            slug,
            project.title,
            project.summary,
            project.workflow,
            project.year,
            project.image,
            project.modelUrl || null,
            project.format,
            project.modelSize,
            project.assetCategory || null,
            project.downloadPolicy,
            JSON.stringify(project.stack || []),
            JSON.stringify(project.viewerFeatures || []),
            project.isPublic !== false,
            ...getLocalizedProjectValues(project),
          ],
        )

        return result.rows[0] || null
      }

      const result = await pool.query(
        `
          INSERT INTO project_overrides
            (slug, title, summary, workflow, year, image, model_url, format,
             model_size, asset_category, download_policy, stack, viewer_features, is_public,
             title_zh, title_en, title_ja, summary_zh, summary_en, summary_ja,
             workflow_zh, workflow_en, workflow_ja, format_zh, format_en, format_ja,
             model_size_zh, model_size_en, model_size_ja, download_policy_zh,
             download_policy_en, download_policy_ja, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, now())
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            title_zh = EXCLUDED.title_zh,
            title_en = EXCLUDED.title_en,
            title_ja = EXCLUDED.title_ja,
            summary = EXCLUDED.summary,
            summary_zh = EXCLUDED.summary_zh,
            summary_en = EXCLUDED.summary_en,
            summary_ja = EXCLUDED.summary_ja,
            workflow = EXCLUDED.workflow,
            workflow_zh = EXCLUDED.workflow_zh,
            workflow_en = EXCLUDED.workflow_en,
            workflow_ja = EXCLUDED.workflow_ja,
            year = EXCLUDED.year,
            image = EXCLUDED.image,
            model_url = EXCLUDED.model_url,
            format = EXCLUDED.format,
            format_zh = EXCLUDED.format_zh,
            format_en = EXCLUDED.format_en,
            format_ja = EXCLUDED.format_ja,
            model_size = EXCLUDED.model_size,
            model_size_zh = EXCLUDED.model_size_zh,
            model_size_en = EXCLUDED.model_size_en,
            model_size_ja = EXCLUDED.model_size_ja,
            asset_category = EXCLUDED.asset_category,
            download_policy = EXCLUDED.download_policy,
            download_policy_zh = EXCLUDED.download_policy_zh,
            download_policy_en = EXCLUDED.download_policy_en,
            download_policy_ja = EXCLUDED.download_policy_ja,
            stack = EXCLUDED.stack,
            viewer_features = EXCLUDED.viewer_features,
            is_public = EXCLUDED.is_public,
            updated_at = now()
          RETURNING slug
        `,
        [
          slug,
          project.title,
          project.summary,
          project.workflow,
          project.year,
          project.image,
          project.modelUrl || null,
          project.format,
          project.modelSize,
          project.assetCategory || null,
          project.downloadPolicy,
          JSON.stringify(project.stack || []),
          JSON.stringify(project.viewerFeatures || []),
          project.isPublic !== false,
          ...getLocalizedProjectValues(project),
        ],
      )

      return result.rows[0] || null
    },

    createProject: async (project) => {
      const result = await pool.query(
        `
          INSERT INTO custom_projects
            (slug, title, summary, workflow, year, image, model_url, format,
             model_size, asset_category, download_policy, stack, viewer_features, is_public,
             title_zh, title_en, title_ja, summary_zh, summary_en, summary_ja,
             workflow_zh, workflow_en, workflow_ja, format_zh, format_en, format_ja,
             model_size_zh, model_size_en, model_size_ja, download_policy_zh,
             download_policy_en, download_policy_ja)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
          RETURNING slug
        `,
        [
          project.slug,
          project.title,
          project.summary,
          project.workflow,
          project.year,
          project.image,
          project.modelUrl || null,
          project.format,
          project.modelSize,
          project.assetCategory || null,
          project.downloadPolicy,
          JSON.stringify(project.stack || []),
          JSON.stringify(project.viewerFeatures || []),
          project.isPublic !== false,
          ...getLocalizedProjectValues(project),
        ],
      )

      return result.rows[0] || null
    },

    deleteProject: async (slug) => {
      const customResult = await pool.query(
        `
          DELETE FROM custom_projects
          WHERE slug = $1
          RETURNING slug
        `,
        [slug],
      )

      if (customResult.rows[0]) return customResult.rows[0]

      const deletedResult = await pool.query(
        `
          INSERT INTO deleted_projects (slug)
          VALUES ($1)
          ON CONFLICT (slug) DO UPDATE SET deleted_at = now()
          RETURNING slug
        `,
        [slug],
      )

      return deletedResult.rows[0] || null
    },

    deleteComment: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM project_comments
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteContactMessage: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM contact_messages
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteDownloadRequest: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM download_requests
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteCommunityUpload: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_uploads
          WHERE id = $1
          RETURNING id, file_url
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteCommunityPost: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_posts
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteCommunityComment: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_comments
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },
  }

  return {
    adminStore,
    authStore,
    close: () => pool.end(),
    communityStore,
    contactMessagesStore,
    downloadRequestsStore,
    interactionsStore,
    projectStore,
  }
}
