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

    -- A post's own picture, for the page and for the card a shared link
    -- produces. Nullable and additive: older code ignores it, and a rollback
    -- leaves the column sitting harmlessly unread.
    ALTER TABLE community_posts
      ADD COLUMN IF NOT EXISTS image_url text;

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

  // ---------------------------------------------------------------------
  // The platform tables. See docs/adr/ADR_PLATFORM_PIVOT.md.
  //
  // The site is becoming a marketplace where anyone publishes, so a work
  // belongs to a creator instead of to the site. These tables are created
  // empty and nothing reads them yet -- phase 1 is the data model and the
  // migration, and it deploys without changing a single page.
  // ---------------------------------------------------------------------
  await pool.query(`
    -- A creator is a visitor_users row with more on it, not a separate
    -- account. handle/bio/avatar_url/banner_url already exist for profiles;
    -- these are the columns a marketplace adds. creator_enabled_at is what
    -- distinguishes "has an account" from "publishes here", so the two can
    -- diverge later (verification, suspension) without a second table.
    ALTER TABLE visitor_users
      ADD COLUMN IF NOT EXISTS theme jsonb,
      -- How this creator wants to be paid. The platform never touches the
      -- money, so this is the whole payment system: an Alipay or WeChat code
      -- and a line of instructions, shown to a buyer who has placed an order.
      ADD COLUMN IF NOT EXISTS payment_info jsonb,
      ADD COLUMN IF NOT EXISTS creator_enabled_at timestamptz,
      ADD COLUMN IF NOT EXISTS stripe_account_id text,
      ADD COLUMN IF NOT EXISTS payout_state text NOT NULL DEFAULT 'none';

    -- The new centre of gravity. It replaces the split between content.js,
    -- project_overrides, custom_projects and the work-shaped half of
    -- community_uploads -- but only once phases 2-3 are built; for now the old
    -- tables keep serving the site untouched.
    --
    -- The localized columns mirror custom_projects exactly so the migration of
    -- the four existing works is lossless: the admin console already edits
    -- these eighteen fields and none of that work is thrown away.
    --
    -- creator_id is ON DELETE RESTRICT, unlike every other reference to
    -- visitor_users in this file. Those are attribution and may go NULL; this
    -- one is ownership, and a work with no owner is not a thing the
    -- marketplace can price, sell or pay out. Deleting an account with works
    -- has to be an explicit act, so authStore/adminStore check first and
    -- refuse with a message rather than letting Postgres raise.
    CREATE TABLE IF NOT EXISTS works (
      id text PRIMARY KEY,
      creator_id text NOT NULL REFERENCES visitor_users(id) ON DELETE RESTRICT,
      slug text NOT NULL,
      status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'hidden', 'rejected')),
      title text NOT NULL,
      title_zh text,
      title_en text,
      title_ja text,
      summary text NOT NULL DEFAULT '',
      summary_zh text,
      summary_en text,
      summary_ja text,
      workflow text,
      workflow_zh text,
      workflow_en text,
      workflow_ja text,
      format text,
      format_zh text,
      format_en text,
      format_ja text,
      model_size text,
      model_size_zh text,
      model_size_en text,
      model_size_ja text,
      download_policy text,
      download_policy_zh text,
      download_policy_en text,
      download_policy_ja text,
      year text,
      asset_category text,
      image text,
      model_url text,
      stack jsonb NOT NULL DEFAULT '[]'::jsonb,
      viewer_features jsonb NOT NULL DEFAULT '[]'::jsonb,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- Integers, never floats, and the currency is explicit. price_cents = 0
      -- means free, which is a price and not a missing value.
      price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
      currency text NOT NULL DEFAULT 'usd',
      license text,
      -- Where this row came from, so the migration is auditable and can be
      -- re-run idempotently: 'content' | 'custom_projects' | 'upload'.
      source text,
      source_slug text,
      published_at timestamptz,
      moderated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- /w/:handle/:slug, so the slug only has to be unique to its creator.
    CREATE UNIQUE INDEX IF NOT EXISTS works_creator_slug_unique_idx
      ON works (creator_id, lower(slug));

    CREATE INDEX IF NOT EXISTS works_status_published_idx
      ON works (status, published_at DESC);

    CREATE INDEX IF NOT EXISTS works_creator_updated_idx
      ON works (creator_id, updated_at DESC);

    -- A work is a bundle, which community_uploads never was: one row per file
    -- from the start, because retrofitting this after rows have money attached
    -- is a migration nobody wants to run.
    CREATE TABLE IF NOT EXISTS work_assets (
      id text PRIMARY KEY,
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      kind text NOT NULL
        CHECK (kind IN ('preview', 'model', 'source', 'texture', 'image')),
      file_name text NOT NULL,
      file_type text NOT NULL DEFAULT '',
      file_url text NOT NULL,
      file_size bigint NOT NULL DEFAULT 0,
      checksum text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS work_assets_work_idx
      ON work_assets (work_id, kind, sort_order);

    -- Shaped on community_comments, which already threads, plus the moderation
    -- status project_comments learned the hard way and the pin a YouTube-style
    -- discussion needs. Counts are not stored: project_likes and
    -- community_comment_likes are both counted live, and a denormalised
    -- counter that drifts is worse than a join.
    CREATE TABLE IF NOT EXISTS work_comments (
      id text PRIMARY KEY,
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      parent_id text REFERENCES work_comments(id) ON DELETE CASCADE,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      author text NOT NULL,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'published'
        CHECK (status IN ('published', 'pending', 'hidden')),
      pinned_at timestamptz,
      edited_at timestamptz,
      moderated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS work_comments_work_created_idx
      ON work_comments (work_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS work_comments_parent_idx
      ON work_comments (parent_id, created_at);

    CREATE TABLE IF NOT EXISTS work_comment_likes (
      comment_id text NOT NULL REFERENCES work_comments(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS work_likes (
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      visitor_id text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (work_id, visitor_id)
    );

    CREATE INDEX IF NOT EXISTS work_likes_work_idx ON work_likes (work_id);

    -- An order grants the right to a download ticket. It does not replace
    -- download_tickets/download_events, which already exist and already
    -- expire -- a second authorisation path would be a second place to get
    -- authorisation wrong.
    --
    -- buyer_id goes NULL if the buyer deletes their account: the financial
    -- record has to survive, the person does not have to. creator_id is
    -- RESTRICT for the same reason works.creator_id is.
    CREATE TABLE IF NOT EXISTS orders (
      id text PRIMARY KEY,
      buyer_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      work_id text NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
      creator_id text NOT NULL REFERENCES visitor_users(id) ON DELETE RESTRICT,
      amount_cents integer NOT NULL CHECK (amount_cents >= 0),
      platform_fee_cents integer NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
      currency text NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
      stripe_payment_intent_id text,
      stripe_checkout_session_id text,
      purchased_at timestamptz,
      refunded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- Webhook idempotency, built in before the first webhook exists. Stripe
    -- retries, and "charged twice because the retry arrived" is a bug you only
    -- get to fix after it has taken someone's money.
    CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_intent_unique_idx
      ON orders (stripe_payment_intent_id)
      WHERE stripe_payment_intent_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS orders_buyer_created_idx
      ON orders (buyer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS orders_creator_created_idx
      ON orders (creator_id, created_at DESC);

    -- One row per transfer Stripe makes to a creator. Stripe is the ledger of
    -- record; this is the local mirror that lets a creator see their own
    -- history without an API call on every page load.
    CREATE TABLE IF NOT EXISTS payouts (
      id text PRIMARY KEY,
      creator_id text NOT NULL REFERENCES visitor_users(id) ON DELETE RESTRICT,
      amount_cents integer NOT NULL,
      currency text NOT NULL,
      period_start date,
      period_end date,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed')),
      stripe_transfer_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS payouts_creator_created_idx
      ON payouts (creator_id, created_at DESC);

    -- ------------------------------------------------------------------
    -- Making orders provider-agnostic.
    --
    -- The table was written Stripe-shaped, and Stripe turned out not to be
    -- the first provider: it does not serve mainland China, and the owner has
    -- no business entity yet. The columns below are what every provider has --
    -- a name and a reference -- so the Stripe ones become one provider's
    -- detail rather than the schema's assumption.
    -- ------------------------------------------------------------------
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS provider_reference text,
      -- What the buyer says they paid with, and what the operator saw when
      -- confirming it. On a manual settlement these two ARE the audit trail.
      ADD COLUMN IF NOT EXISTS buyer_note text,
      ADD COLUMN IF NOT EXISTS settled_note text,
      ADD COLUMN IF NOT EXISTS settled_by text;

    -- Idempotency, the same job orders_payment_intent_unique_idx does for
    -- Stripe, for whatever provider is in use.
    CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_reference_unique_idx
      ON orders (provider, provider_reference)
      WHERE provider_reference IS NOT NULL;

    -- The entitlement rule itself, in the database rather than only in a
    -- query: one PAID order per buyer per work. You own a thing once. A
    -- refunded order leaves the slot free, which is what lets someone buy
    -- again after a refund.
    CREATE UNIQUE INDEX IF NOT EXISTS orders_paid_entitlement_unique_idx
      ON orders (buyer_id, work_id)
      WHERE status = 'paid';

    -- A small, fast copy of the cover, for grids.
    --
    -- The image column points at the preview file the creator uploaded, and
    -- that file is theirs: it is listed under Files included and downloaded, so
    -- it is never rewritten. But it is also what every tile on the catalogue
    -- was loading -- measured on 2026-09-10, four tiles came to 15.31MB, one of
    -- them 8.47MB. This column holds a separate generated file. Nullable
    -- because every row that predates it has none, and because a work whose
    -- thumbnail failed to render should still list with its full-size cover
    -- rather than list with nothing.
    ALTER TABLE works
      ADD COLUMN IF NOT EXISTS thumbnail text;

    -- A ticket can now be for a work as well as for a project. project_slug
    -- stops being mandatory because a work has no slug of its own that is
    -- unique site-wide -- the pair (creator, slug) is.
    ALTER TABLE download_tickets
      ADD COLUMN IF NOT EXISTS work_id text REFERENCES works(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS order_id text REFERENCES orders(id) ON DELETE SET NULL;

    ALTER TABLE download_tickets ALTER COLUMN project_slug DROP NOT NULL;

    -- The creator's payment methods AS THE BUYER WAS SHOWN THEM.
    --
    -- Not a denormalisation for speed: it is the evidence. A creator who
    -- changes their payment code after a dispute starts would otherwise erase
    -- what the buyer was actually told to pay, and the order would agree with
    -- the creator's new story.
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_snapshot jsonb;

    -- Append-only history of everything that happened to an order: who did
    -- it, when, from what to what, and what they said about it.
    --
    -- A separate table rather than a jsonb array on the order, because an
    -- array is rewritten whole on every append -- and a record that can be
    -- rewritten whole is not a record. Nothing in ordersStore updates or
    -- deletes a row here.
    CREATE TABLE IF NOT EXISTS order_events (
      id text PRIMARY KEY,
      order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      actor_kind text NOT NULL
        CHECK (actor_kind IN ('buyer', 'creator', 'admin', 'system')),
      actor_id text,
      event text NOT NULL,
      from_status text,
      to_status text,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS order_events_order_idx
      ON order_events (order_id, created_at);
  `)

  // A ticket that names neither a project nor a work authorises nothing and
  // can only be a bug. ADD CONSTRAINT has no IF NOT EXISTS, so the duplicate
  // is swallowed -- which is what makes running this on every boot safe.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE download_tickets
        ADD CONSTRAINT download_tickets_target_check
        CHECK (project_slug IS NOT NULL OR work_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
}
