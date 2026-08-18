// The admin shell's navigation and the per-section constants that describe it.

// The nav is grouped rather than a flat pill row. Eight equal pills gave no
// clue that "Likes" is a read-only curiosity and "Downloads" is a queue with
// people waiting on it; the grouping says what each section is for before it
// is opened.
//
// Labels are translation keys, not words: the console speaks Chinese, English
// and Japanese, and a nav item that hard-coded "Dashboard" would be the one
// English word left on a Japanese screen. The `group` field stays a stable id
// so grouping and lookups never depend on the language in use.
export const sections = [
  { group: 'overview', icon: 'dashboard', key: 'overview' },
  { group: 'catalogue', icon: 'projects', key: 'projects' },
  { group: 'catalogue', icon: 'search', key: 'content-health' },
  { group: 'catalogue', icon: 'community', key: 'community' },
  { group: 'moderation', icon: 'comments', key: 'comments' },
  { group: 'moderation', icon: 'downloads', key: 'downloads' },
  { group: 'moderation', icon: 'messages', key: 'messages' },
  { group: 'people', icon: 'visitors', key: 'visitors' },
  { group: 'people', icon: 'likes', key: 'likes' },
  { group: 'operations', icon: 'security', key: 'security' },
  { group: 'operations', icon: 'system', key: 'system' },
]

export const sectionGroups = sections.reduce((groups, section) => {
  const bucket = groups.find((item) => item.name === section.group)
  if (bucket) bucket.items.push(section)
  else groups.push({ items: [section], name: section.group })

  return groups
}, [])

export const sectionLabelKey = (key) => `section.${key}`

export const sectionGroupKey = (group) => `group.${group}`

// The search box only appears where it can actually filter rows. Leaving it
// above the dashboard and the enrolment form invited people to type into a
// field that does nothing.
export const searchableSections = new Set([
  'projects',
  'comments',
  'likes',
  'visitors',
  'community',
  'downloads',
  'messages',
])

export const visitorAccessPresets = [
  { labelKey: 'access.guest', value: 'guest' },
  { labelKey: 'access.member', value: 'member' },
  { labelKey: 'access.approved', value: 'approved' },
]

export const visitorDetailTabs = [
  { key: 'overview', labelKey: 'tab.overview' },
  { key: 'comments', labelKey: 'tab.comments' },
  { key: 'posts', labelKey: 'tab.posts' },
  { key: 'uploads', labelKey: 'tab.uploads' },
  { key: 'download-requests', labelKey: 'tab.download-requests' },
  { key: 'actions', labelKey: 'tab.actions' },
]
