export const assetCategoryProfiles = [
  {
    accent: '#36c7d4',
    description: '使用 PBR 材质流程制作的次世代道具资产，强调结构、质感与展示灯光。',
    label: '次世代道具',
    shortLabel: '道具',
    value: 'next-gen-prop',
  },
  {
    accent: '#b08cff',
    description: '面向实时展示的角色模型，重点关注轮廓、材质分区和角色识别度。',
    label: '次世代角色',
    shortLabel: '角色',
    value: 'next-gen-character',
  },
  {
    accent: '#75e2a8',
    description: '场景与环境资产展示，关注空间层次、构图关系和灯光氛围。',
    label: '次世代场景',
    shortLabel: '场景',
    value: 'next-gen-scene',
  },
  {
    accent: '#72b7ff',
    description: '以颜色、轮廓和手绘贴图表现为核心的角色资产。',
    label: '手绘角色',
    shortLabel: '手绘角色',
    value: 'hand-painted-character',
  },
  {
    accent: '#f2c879',
    description: '以色彩氛围、空间阅读和风格化表现为核心的手绘场景。',
    label: '手绘场景',
    shortLabel: '手绘场景',
    value: 'hand-painted-scene',
  },
  {
    accent: '#a7adbd',
    description: '未归入特定类别的模型练习、材质测试和作品整理。',
    label: '综合作品',
    shortLabel: '综合',
    value: 'generic',
  },
]

const legacyAssetCategoryAliases = {
  'hand-painted': 'hand-painted-character',
}

export const inferAssetCategory = (project = {}) => {
  const explicitCategory = legacyAssetCategoryAliases[project.assetCategory] || project.assetCategory

  if (assetCategoryProfiles.some((category) => category.value === explicitCategory)) {
    return explicitCategory
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

  if (/hand.?paint|painted/.test(haystack) && /environment|scene|level|world/.test(haystack)) {
    return 'hand-painted-scene'
  }
  if (/hand.?paint|painted|obj/.test(haystack)) return 'hand-painted-character'
  if (/environment|scene/.test(haystack)) return 'next-gen-scene'
  if (/character/.test(haystack)) return 'next-gen-character'
  if (/pbr|prop|fbx|glb|realtime/.test(haystack)) return 'next-gen-prop'

  return 'generic'
}

export const getAssetCategoryProfile = (project = {}) =>
  assetCategoryProfiles.find((category) => category.value === inferAssetCategory(project)) ||
  assetCategoryProfiles.at(-1)
