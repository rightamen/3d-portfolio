// The admin shell's navigation and the per-section constants that describe it.

// The nav is grouped rather than a flat pill row. Eight equal pills gave no
// clue that "Likes" is a read-only curiosity and "Downloads" is a queue with
// people waiting on it; the grouping says what each section is for before it
// is opened.
export const sections = [
  { group: 'Overview', icon: 'dashboard', key: 'overview', label: 'Dashboard' },
  { group: 'Catalogue', icon: 'projects', key: 'projects', label: 'Projects' },
  { group: 'Catalogue', icon: 'search', key: 'content-health', label: 'Content Health' },
  { group: 'Catalogue', icon: 'community', key: 'community', label: 'Community' },
  { group: 'Moderation', icon: 'comments', key: 'comments', label: 'Comments' },
  { group: 'Moderation', icon: 'downloads', key: 'downloads', label: 'Downloads' },
  { group: 'Moderation', icon: 'messages', key: 'messages', label: 'Messages' },
  { group: 'People', icon: 'visitors', key: 'visitors', label: 'Members' },
  { group: 'People', icon: 'likes', key: 'likes', label: 'Likes' },
  { group: 'Operations', icon: 'security', key: 'security', label: 'Security' },
  { group: 'Operations', icon: 'system', key: 'system', label: 'System' },
]

export const sectionGroups = sections.reduce((groups, section) => {
  const bucket = groups.find((item) => item.name === section.group)
  if (bucket) bucket.items.push(section)
  else groups.push({ items: [section], name: section.group })

  return groups
}, [])

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
  { label: 'Open Access', value: 'guest' },
  { label: 'Member', value: 'member' },
  { label: 'Approved', value: 'approved' },
]

export const visitorDetailTabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'comments', label: 'Comments' },
  { key: 'posts', label: 'Posts' },
  { key: 'uploads', label: 'Resources' },
  { key: 'download-requests', label: 'Downloads' },
  { key: 'actions', label: 'Moderation Log' },
]
