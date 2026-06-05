export const assetCategoryProfiles = [
  {
    accent: '#36c7d4',
    description: '使用 PBR 材质流程制作的次世代道具资产，强调结构、质感与展示灯光。',
    descriptions: {
      en: 'Next-gen prop assets made with a PBR workflow, emphasizing structure, surface response, and studio lighting.',
      ja: 'PBRワークフローで制作した次世代小物アセット。構造、質感、展示ライティングを重視します。',
      zh: '使用 PBR 材质流程制作的次世代道具资产，强调结构、质感与展示灯光。',
    },
    label: '次世代道具',
    labels: {
      en: 'Next-Gen Props',
      ja: '次世代小物',
      zh: '次世代道具',
    },
    shortLabel: '道具',
    shortLabels: {
      en: 'Props',
      ja: '小物',
      zh: '道具',
    },
    value: 'next-gen-prop',
  },
  {
    accent: '#b08cff',
    description: '面向实时展示的角色模型，重点关注轮廓、材质分区和角色识别度。',
    descriptions: {
      en: 'Realtime character models focused on silhouette, material separation, and character readability.',
      ja: 'リアルタイム表示向けのキャラクターモデル。シルエット、素材分け、識別性を重視します。',
      zh: '面向实时展示的角色模型，重点关注轮廓、材质分区和角色识别度。',
    },
    label: '次世代角色',
    labels: {
      en: 'Next-Gen Characters',
      ja: '次世代キャラクター',
      zh: '次世代角色',
    },
    shortLabel: '角色',
    shortLabels: {
      en: 'Characters',
      ja: 'キャラ',
      zh: '角色',
    },
    value: 'next-gen-character',
  },
  {
    accent: '#75e2a8',
    description: '场景与环境资产展示，关注空间层次、构图关系和灯光氛围。',
    descriptions: {
      en: 'Environment and scene assets with attention to spatial layers, composition, and lighting mood.',
      ja: '背景・環境アセット。空間の階層、構図、光の雰囲気を重視します。',
      zh: '场景与环境资产展示，关注空间层次、构图关系和灯光氛围。',
    },
    label: '次世代场景',
    labels: {
      en: 'Next-Gen Scenes',
      ja: '次世代背景',
      zh: '次世代场景',
    },
    shortLabel: '场景',
    shortLabels: {
      en: 'Scenes',
      ja: '背景',
      zh: '场景',
    },
    value: 'next-gen-scene',
  },
  {
    accent: '#72b7ff',
    description: '以颜色、轮廓和手绘贴图表现为核心的角色资产。',
    descriptions: {
      en: 'Character assets centered on color, silhouette, and hand-painted texture presentation.',
      ja: '色、シルエット、手描きテクスチャ表現を中心にしたキャラクターアセット。',
      zh: '以颜色、轮廓和手绘贴图表现为核心的角色资产。',
    },
    label: '手绘角色',
    labels: {
      en: 'Hand-Painted Characters',
      ja: '手描きキャラクター',
      zh: '手绘角色',
    },
    shortLabel: '手绘角色',
    shortLabels: {
      en: 'Painted Characters',
      ja: '手描きキャラ',
      zh: '手绘角色',
    },
    value: 'hand-painted-character',
  },
  {
    accent: '#f2c879',
    description: '以色彩氛围、空间阅读和风格化表现为核心的手绘场景。',
    descriptions: {
      en: 'Hand-painted scenes focused on color mood, spatial readability, and stylized presentation.',
      ja: '色の雰囲気、空間の読みやすさ、スタイライズ表現を中心にした手描き背景。',
      zh: '以色彩氛围、空间阅读和风格化表现为核心的手绘场景。',
    },
    label: '手绘场景',
    labels: {
      en: 'Hand-Painted Scenes',
      ja: '手描き背景',
      zh: '手绘场景',
    },
    shortLabel: '手绘场景',
    shortLabels: {
      en: 'Painted Scenes',
      ja: '手描き背景',
      zh: '手绘场景',
    },
    value: 'hand-painted-scene',
  },
  {
    accent: '#a7adbd',
    description: '未归入特定类别的模型练习、材质测试和作品整理。',
    descriptions: {
      en: 'Model studies, material tests, and portfolio pieces that do not belong to a specific category.',
      ja: '特定カテゴリに属さないモデル練習、マテリアルテスト、作品整理。',
      zh: '未归入特定类别的模型练习、材质测试和作品整理。',
    },
    label: '综合作品',
    labels: {
      en: 'General Work',
      ja: '総合作品',
      zh: '综合作品',
    },
    shortLabel: '综合',
    shortLabels: {
      en: 'General',
      ja: '総合',
      zh: '综合',
    },
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

export const getAssetCategoryProfile = (project = {}, language = 'zh') => {
  const category =
    assetCategoryProfiles.find((item) => item.value === inferAssetCategory(project)) ||
    assetCategoryProfiles.at(-1)

  return {
    ...category,
    description: category.descriptions?.[language] || category.description,
    label: category.labels?.[language] || category.label,
    shortLabel: category.shortLabels?.[language] || category.shortLabel,
  }
}
