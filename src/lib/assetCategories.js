export const assetCategoryProfiles = [
  {
    accent: '#36c7d4',
    description: 'Production props with PBR texture response and studio lighting.',
    label: 'Next-Gen Props',
    shortLabel: 'Props',
    value: 'next-gen-prop',
  },
  {
    accent: '#b08cff',
    description: 'Realtime characters tuned for material readability and silhouette.',
    label: 'Next-Gen Characters',
    shortLabel: 'Characters',
    value: 'next-gen-character',
  },
  {
    accent: '#75e2a8',
    description: 'Environment and scene presentations with wider framing.',
    label: 'Next-Gen Scenes',
    shortLabel: 'Scenes',
    value: 'next-gen-scene',
  },
  {
    accent: '#72b7ff',
    description: 'Color-first characters shown with flat texture presentation.',
    label: 'Hand-Painted Characters',
    shortLabel: 'Painted Characters',
    value: 'hand-painted',
  },
  {
    accent: '#a7adbd',
    description: 'Case studies, UI systems, and general portfolio work.',
    label: 'General Work',
    shortLabel: 'General',
    value: 'generic',
  },
]

export const inferAssetCategory = (project = {}) => {
  if (assetCategoryProfiles.some((category) => category.value === project.assetCategory)) {
    return project.assetCategory
  }

  const haystack = [
    project.format,
    project.modelSize,
    project.title,
    ...(project.stack || []),
    ...(project.viewerFeatures || []),
  ]
    .join(' ')
    .toLowerCase()

  if (/hand.?paint|painted|obj/.test(haystack)) return 'hand-painted'
  if (/environment|scene/.test(haystack)) return 'next-gen-scene'
  if (/character/.test(haystack)) return 'next-gen-character'
  if (/pbr|prop|fbx|glb|realtime/.test(haystack)) return 'next-gen-prop'

  return 'generic'
}

export const getAssetCategoryProfile = (project = {}) =>
  assetCategoryProfiles.find((category) => category.value === inferAssetCategory(project)) ||
  assetCategoryProfiles.at(-1)
