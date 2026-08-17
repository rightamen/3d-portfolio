// Row -> API-shape mappers shared by every store, plus the project field list
// they all agree on. Kept apart from the stores because they are the contract:
// what a `visitor_users` row looks like to a public page, to the owner, and to
// an admin are three different objects, and the difference is enforced here.

export const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Author summary attached to comments, posts, and uploads. The account email is
// PII and must never reach an unauthenticated response, so it is opt-in: only
// adminStore call sites pass includeEmail. Public list/detail endpoints reuse
// the same mappers and therefore stay email-free by construction.
export const toUserSummary = (row, { includeEmail = false } = {}) =>
  row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        id: row.user_id,
        ...(includeEmail ? { email: row.email } : {}),
      }
    : null

export const toComment = (row, options) => ({
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
export const toAccountUserRecord = (row) =>
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
export const toAdminUser = (row) =>
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

export const toPrivateUser = (row) =>
  row
    ? {
        ...toAccountUserRecord(row),
        failedLoginCount: Number(row.failed_login_count || 0),
        lockedUntil: row.locked_until?.toISOString?.() || row.locked_until || null,
        passwordHash: row.password_hash,
      }
    : null

export const toAccountProfile = (row) =>
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

export const toPublicProfile = (row) =>
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

export const publicContactLinks = (contactLinks = {}, contactsPublic = false) => {
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

export const toCommunityUpload = (row, options) => ({
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

export const toCommunityPost = (row, options) => ({
  createdAt: row.created_at.toISOString(),
  id: row.id,
  message: row.message,
  title: row.title,
  topic: row.topic,
  updatedAt: row.updated_at.toISOString(),
  user: toUserSummary(row, options),
})

export const toCommunityComment = (row) => ({
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

export const toProjectOverride = (row) => ({
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

export const toCustomProject = (row) => ({
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

export const mergeProject = (project, override) => {
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

export const localizedProjectFields = [
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

export const getLocalizedProjectValues = (project) =>
  localizedProjectFields.map((field) => project[field] || null)
