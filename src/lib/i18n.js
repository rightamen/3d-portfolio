export const languages = [
  { code: 'zh', label: '中文', shortLabel: '中' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'ja', label: '日本語', shortLabel: '日' },
]

export const defaultLanguage = 'zh'

const copy = {
  zh: {
    loading: '正在加载',
    navHome: '首页',
    navAbout: '关于',
    navProjects: '作品',
    navExperience: '经历',
    navContact: '联系',
    toggleLanguage: '切换语言',
    toggleMenu: '打开菜单',
    heroGreeting: '你好，我是',
    heroLine1: '专注模型创作',
    heroLine2: '角色、道具与场景',
    heroMobileLine: '正在创作',
    heroMobileSubtitle: '角色、道具与场景资产',
    heroTitle: '三维模型与游戏美术资产创作者',
    heroError: '作品数据正在加载，模型展示仍可继续浏览。',
    heroProjects: '查看作品',
    heroContact: '联系我',
    heroWords: ['角色模型', '次世代道具', '手绘贴图', '场景资产'],
    aboutKicker: '关于我',
    aboutTitle: '模型创作与资产呈现',
    aboutGreeting: '你好，我是 Right',
    aboutBody:
      '我是一名模型创作者，主要制作角色、道具与场景资产，关注形体语言、拓扑结构、材质贴图与光影表现。',
    aboutIntro:
      '我专注于角色、道具、场景等三维模型资产，重视造型、材质、贴图和最终展示效果。',
    aboutCraft: '模型即作品',
    aboutCards: ['造型', '结构', '光影', '材质', '雕塑感'],
    aboutManagementTitle: '作品管理',
    aboutManagementBody: '将角色、道具、场景和贴图作品按资产类型整理，方便持续更新、展示和授权管理。',
    aboutFocusTitle: '创作重点',
    aboutFocusBody: '造型比例、轮廓识别、材质质感、贴图颜色，以及最终画面表现力。',
    aboutToolsTitle: '工具箱',
    projectsKicker: '作品展示',
    projectsTitle: '按资产类别整理的三维作品',
    projectsIntro:
      '集中展示次世代道具、角色、场景，以及手绘资产的模型预览、纹理表现和项目说明。',
    allWork: '全部作品',
    workCount: '个作品',
    waitingUpload: '等待上传',
    emptyCategoryTitle: '这个分类还没有作品。',
    emptyCategoryBody: '后续上传并分配到该分类的模型会自动显示在这里。',
    openModelPreview: '打开模型预览',
    viewDetails: '查看详情',
    detailKicker: '作品详情',
    loadingProject: '正在加载作品',
    loadingProjectDetails: '正在加载作品详情...',
    projectLoadError: '作品详情加载失败。',
    close: '关闭',
    year: '年份',
    format: '格式',
    modelSize: '模型大小',
    downloadPolicy: '下载权限',
    modelPreviewFallback: '模型预览',
    assetPreviewFallback: '预览资产',
    requestOnly: '按申请开放',
    workflow: '制作流程',
    workflowFallback: '该作品围绕模型结构、材质贴图和展示效果进行整理。',
    viewerFeatures: '预览功能',
    productionTags: '制作标签',
    openModelViewer: '打开模型查看器',
    requestDownload: '申请下载',
    downloadRequest: '下载申请',
    downloadRequestHint: '请简单说明用途。通过审核后，我会再开放对应的下载链接。',
    name: '名称',
    email: '邮箱',
    purpose: '用途说明',
    submitting: '提交中...',
    submitRequest: '提交申请',
    requestSent: '申请已收到。我会先查看用途说明，再决定是否开放下载。',
    requestError: '申请提交失败，请检查内容后重试。',
    interaction: '互动',
    likes: '个赞',
    comments: '条评论',
    liked: '已点赞',
    like: '点赞',
    comment: '评论',
    saving: '保存中...',
    postComment: '发布评论',
    interactionError: '互动保存失败，请重试。',
    noComments: '暂无评论，欢迎留下第一条反馈。',
    modelPreview: '模型预览',
    modeTextured: '贴图',
    modeStudio: '棚拍',
    modeClay: '素模',
    modeWireframe: '线框',
    reset: '重置',
    autoRotate: '自动旋转',
    experienceKicker: '创作经历',
    experienceTitle: '围绕造型、材质与画面表现建立的创作流程',
    experienceIntro:
      '从模型结构、拓扑、UV、贴图到灯光展示，持续打磨每个资产的形体语言和最终观感。',
    contactKicker: '联系我',
    contactTitle: '让下一个作品开始成形',
    contactIntro:
      '如果你想交流模型作品、申请资产下载，或讨论角色、道具、场景制作合作，可以在这里留下信息。',
    message: '留言',
    sending: '发送中...',
    sendMessage: '发送留言',
    messageSent: '留言已保存，我会通过邮箱回复。',
    messageError: '发送失败，请稍后再试或直接通过邮箱联系。',
    footerLine: '角色、道具、场景与材质贴图作品。',
  },
  en: {
    loading: 'Loading',
    navHome: 'Home',
    navAbout: 'About',
    navProjects: 'Work',
    navExperience: 'Process',
    navContact: 'Contact',
    toggleLanguage: 'Change language',
    toggleMenu: 'Toggle menu',
    heroGreeting: 'Hi, I am',
    heroLine1: 'Model creation for',
    heroLine2: 'characters, props, and scenes',
    heroMobileLine: 'Creating',
    heroMobileSubtitle: 'character, prop, and scene assets',
    heroTitle: '3D model and game art asset creator',
    heroError: 'Portfolio data is loading, but the model showcase is still available.',
    heroProjects: 'View Work',
    heroContact: 'Contact Me',
    heroWords: ['Character Models', 'Next-Gen Props', 'Hand-Painted Textures', 'Scene Assets'],
    aboutKicker: 'About',
    aboutTitle: 'Model Creation And Asset Presentation',
    aboutGreeting: 'Hi, I am Right',
    aboutBody:
      'I am a model creator focused on characters, props, and scene assets, with attention to form language, topology, materials, textures, and lighting.',
    aboutIntro:
      'My work centers on 3D assets for games and realtime presentation, balancing shape, material response, texture color, and final visual impact.',
    aboutCraft: 'MODEL AS ART',
    aboutCards: ['Form', 'Structure', 'Light', 'Material', 'Sculpt'],
    aboutManagementTitle: 'Asset Library',
    aboutManagementBody:
      'Characters, props, scenes, and texture works are organized by asset type for updates, presentation, and download authorization.',
    aboutFocusTitle: 'Creative Focus',
    aboutFocusBody:
      'Proportion, silhouette, material feel, texture color, and the final readability of the image.',
    aboutToolsTitle: 'Toolkit',
    projectsKicker: 'Selected Work',
    projectsTitle: '3D Work Organized By Asset Type',
    projectsIntro:
      'A focused look at next-gen props, characters, scenes, and hand-painted assets with model previews, texture presentation, and production notes.',
    allWork: 'All Work',
    workCount: 'works',
    waitingUpload: 'Awaiting Upload',
    emptyCategoryTitle: 'No work in this category yet.',
    emptyCategoryBody: 'Models assigned to this category will appear here after upload.',
    openModelPreview: 'Open Model Preview',
    viewDetails: 'View Details',
    detailKicker: 'Project Detail',
    loadingProject: 'Loading project',
    loadingProjectDetails: 'Loading project details...',
    projectLoadError: 'Project details failed to load.',
    close: 'Close',
    year: 'Year',
    format: 'Format',
    modelSize: 'Model Size',
    downloadPolicy: 'Download Access',
    modelPreviewFallback: 'Model Preview',
    assetPreviewFallback: 'Preview Asset',
    requestOnly: 'Available On Request',
    workflow: 'Workflow',
    workflowFallback: 'This work is organized around model structure, texture work, and presentation quality.',
    viewerFeatures: 'Viewer Features',
    productionTags: 'Production Tags',
    openModelViewer: 'Open Model Viewer',
    requestDownload: 'Request Download',
    downloadRequest: 'Download Request',
    downloadRequestHint:
      'Briefly describe your intended use. After review, I can open the matching download link.',
    name: 'Name',
    email: 'Email',
    purpose: 'Purpose',
    submitting: 'Submitting...',
    submitRequest: 'Submit Request',
    requestSent: 'Request received. I will review the purpose before opening the download.',
    requestError: 'Request failed. Please check the fields and try again.',
    interaction: 'Community',
    likes: 'likes',
    comments: 'comments',
    liked: 'Liked',
    like: 'Like',
    comment: 'Comment',
    saving: 'Saving...',
    postComment: 'Post Comment',
    interactionError: 'Interaction failed. Please try again.',
    noComments: 'No comments yet. Be the first to leave feedback.',
    modelPreview: '3D Preview',
    modeTextured: 'Texture',
    modeStudio: 'Studio',
    modeClay: 'Clay',
    modeWireframe: 'Wireframe',
    reset: 'Reset',
    autoRotate: 'Auto Rotate',
    experienceKicker: 'Experience',
    experienceTitle: 'A Process Built Around Form, Material, And Presentation',
    experienceIntro:
      'From model structure, topology, UVs, and texture work to lighting, I keep refining the form language and final look of each asset.',
    contactKicker: 'Contact',
    contactTitle: 'Let The Next Asset Take Shape',
    contactIntro:
      'Leave a message if you want to discuss model work, request an asset download, or talk about character, prop, or scene production.',
    message: 'Message',
    sending: 'Sending...',
    sendMessage: 'Send Message',
    messageSent: 'Message saved. I will reply by email.',
    messageError: 'Send failed. Please try again later or contact me by email.',
    footerLine: 'Characters, props, scenes, materials, and texture work.',
  },
  ja: {
    loading: '読み込み中',
    navHome: 'ホーム',
    navAbout: '紹介',
    navProjects: '作品',
    navExperience: '制作',
    navContact: '連絡',
    toggleLanguage: '言語を切り替え',
    toggleMenu: 'メニューを開く',
    heroGreeting: 'こんにちは、',
    heroLine1: 'モデル制作を中心に',
    heroLine2: 'キャラクター・小物・背景',
    heroMobileLine: '制作中',
    heroMobileSubtitle: 'キャラクター、小物、背景アセット',
    heroTitle: '3Dモデル・ゲームアートアセット制作者',
    heroError: '作品データを読み込み中です。モデル展示は引き続き閲覧できます。',
    heroProjects: '作品を見る',
    heroContact: '連絡する',
    heroWords: ['キャラクターモデル', '次世代小物', '手描きテクスチャ', '背景アセット'],
    aboutKicker: '自己紹介',
    aboutTitle: 'モデル制作とアセット展示',
    aboutGreeting: 'こんにちは、Rightです',
    aboutBody:
      'キャラクター、小物、背景アセットを制作するモデルクリエイターです。形、トポロジー、マテリアル、テクスチャ、ライティングを大切にしています。',
    aboutIntro:
      'ゲームとリアルタイム表示向けの3Dアセットを中心に、造形、質感、色、最終的な見え方を磨いています。',
    aboutCraft: 'モデルは作品',
    aboutCards: ['造形', '構造', '光', '質感', '彫刻感'],
    aboutManagementTitle: '作品管理',
    aboutManagementBody:
      'キャラクター、小物、背景、テクスチャ作品をアセット種別で整理し、更新、展示、ダウンロード許可を管理します。',
    aboutFocusTitle: '制作の重点',
    aboutFocusBody:
      'プロポーション、シルエット、質感、テクスチャ色、最終画面での読みやすさ。',
    aboutToolsTitle: 'ツール',
    projectsKicker: '作品展示',
    projectsTitle: 'アセット種別で整理した3D作品',
    projectsIntro:
      '次世代小物、キャラクター、背景、手描きアセットを、モデルプレビュー、テクスチャ表現、制作メモとともに展示します。',
    allWork: 'すべて',
    workCount: '作品',
    waitingUpload: 'アップロード待ち',
    emptyCategoryTitle: 'このカテゴリにはまだ作品がありません。',
    emptyCategoryBody: 'アップロード後、このカテゴリに割り当てたモデルがここに表示されます。',
    openModelPreview: 'モデルを開く',
    viewDetails: '詳細を見る',
    detailKicker: '作品詳細',
    loadingProject: '作品を読み込み中',
    loadingProjectDetails: '作品詳細を読み込み中...',
    projectLoadError: '作品詳細の読み込みに失敗しました。',
    close: '閉じる',
    year: '年',
    format: '形式',
    modelSize: 'モデルサイズ',
    downloadPolicy: 'ダウンロード権限',
    modelPreviewFallback: 'モデルプレビュー',
    assetPreviewFallback: 'プレビューアセット',
    requestOnly: '申請後に開放',
    workflow: '制作フロー',
    workflowFallback: 'この作品はモデル構造、テクスチャ、展示効果を中心に整理されています。',
    viewerFeatures: 'ビューア機能',
    productionTags: '制作タグ',
    openModelViewer: 'モデルビューアを開く',
    requestDownload: 'ダウンロード申請',
    downloadRequest: 'ダウンロード申請',
    downloadRequestHint: '用途を簡単に記入してください。確認後、対応するリンクを開放します。',
    name: '名前',
    email: 'メール',
    purpose: '用途',
    submitting: '送信中...',
    submitRequest: '申請を送信',
    requestSent: '申請を受け取りました。用途を確認してからダウンロードを開放します。',
    requestError: '申請に失敗しました。内容を確認して再試行してください。',
    interaction: '交流',
    likes: 'いいね',
    comments: 'コメント',
    liked: 'いいね済み',
    like: 'いいね',
    comment: 'コメント',
    saving: '保存中...',
    postComment: 'コメントを投稿',
    interactionError: '保存に失敗しました。再試行してください。',
    noComments: 'コメントはまだありません。最初の感想を残せます。',
    modelPreview: '3Dプレビュー',
    modeTextured: 'テクスチャ',
    modeStudio: 'スタジオ',
    modeClay: '素体',
    modeWireframe: 'ワイヤー',
    reset: 'リセット',
    autoRotate: '自動回転',
    experienceKicker: '制作経験',
    experienceTitle: '造形、質感、画面表現を中心にした制作フロー',
    experienceIntro:
      'モデル構造、トポロジー、UV、テクスチャからライティングまで、各アセットの形と最終的な見え方を磨いています。',
    contactKicker: '連絡',
    contactTitle: '次の作品を形にする',
    contactIntro:
      'モデル作品の相談、アセットのダウンロード申請、キャラクター・小物・背景制作の相談はこちらからどうぞ。',
    message: 'メッセージ',
    sending: '送信中...',
    sendMessage: '送信',
    messageSent: 'メッセージを保存しました。メールで返信します。',
    messageError: '送信に失敗しました。後でもう一度試すか、メールで連絡してください。',
    footerLine: 'キャラクター、小物、背景、マテリアル、テクスチャ作品。',
  },
}

export const getInitialLanguage = () => {
  if (typeof window === 'undefined') return defaultLanguage

  const stored = window.localStorage.getItem('mrright-language')
  if (languages.some((language) => language.code === stored)) return stored

  const browserLanguage = window.navigator.language.toLowerCase()
  if (browserLanguage.startsWith('ja')) return 'ja'
  if (browserLanguage.startsWith('en')) return 'en'
  return defaultLanguage
}

export const getCopy = (language = defaultLanguage) => copy[language] || copy[defaultLanguage]

export const pickLocalized = (item = {}, field, language = defaultLanguage) => {
  const suffix = language === 'zh' ? 'Zh' : language === 'ja' ? 'Ja' : 'En'
  return item[`${field}${suffix}`] || item[field] || ''
}

const labelTranslations = {
  '10-50 MB': {
    ja: '10-50 MB',
    zh: '10-50 MB',
  },
  '50-120 MB': {
    ja: '50-120 MB',
    zh: '50-120 MB',
  },
  'Approved download': {
    ja: '承認後にダウンロード',
    zh: '授权后下载',
  },
  'Approved Download': {
    ja: '承認後にダウンロード',
    zh: '授权后下载',
  },
  'Art And Form Fundamentals': {
    ja: '美術と造形の基礎',
    zh: '美术与造型基础',
  },
  'Authorization required': {
    ja: '許可が必要',
    zh: '需要授权',
  },
  'Auto rotate': {
    ja: '自動回転',
    zh: '自动旋转',
  },
  'Auto-detected after upload': {
    ja: 'アップロード後に自動検出',
    zh: '上传后自动检测',
  },
  'Case study': {
    ja: 'ケーススタディ',
    zh: '案例展示',
  },
  'Character Art': {
    ja: 'キャラクターアート',
    zh: '角色美术',
  },
  'Character model': {
    ja: 'キャラクターモデル',
    zh: '角色模型',
  },
  'Clay view': {
    ja: '素体表示',
    zh: '素模视图',
  },
  'Environment scene': {
    ja: '背景シーン',
    zh: '场景资产',
  },
  'Environment Art': {
    ja: '背景アート',
    zh: '场景美术',
  },
  'FBX model': {
    ja: 'FBXモデル',
    zh: 'FBX 模型',
  },
  'GLB model': {
    ja: 'GLBモデル',
    zh: 'GLB 模型',
  },
  'GLB / PBR': {
    ja: 'GLB / PBR',
    zh: 'GLB / PBR',
  },
  'Grid floor': {
    ja: 'グリッド床',
    zh: '网格地面',
  },
  'Hand-painted character': {
    ja: '手描きキャラクター',
    zh: '手绘角色',
  },
  'Hand-painted scene': {
    ja: '手描き背景',
    zh: '手绘场景',
  },
  'Hand-Painted': {
    ja: '手描き',
    zh: '手绘',
  },
  'Independent Model Creator': {
    ja: '個人モデルクリエイター',
    zh: '独立模型创作者',
  },
  'Image case study': {
    ja: '画像ケーススタディ',
    zh: '图片案例',
  },
  'Lighting preview': {
    ja: 'ライティング確認',
    zh: '灯光预览',
  },
  Lighting: {
    ja: 'ライティング',
    zh: '灯光',
  },
  'Material Study': {
    ja: 'マテリアル習作',
    zh: '材质练习',
  },
  'Material study': {
    ja: 'マテリアル習作',
    zh: '材质练习',
  },
  'Member download': {
    ja: 'メンバーダウンロード',
    zh: '登录后下载',
  },
  'Member Download': {
    ja: 'メンバーダウンロード',
    zh: '登录后下载',
  },
  'OBJ model': {
    ja: 'OBJモデル',
    zh: 'OBJ 模型',
  },
  Optimization: {
    ja: '最適化',
    zh: '优化',
  },
  Orbit: {
    ja: '旋回',
    zh: '环绕',
  },
  'Open download': {
    ja: '自由ダウンロード',
    zh: '免登录下载',
  },
  'Open Download': {
    ja: '自由ダウンロード',
    zh: '免登录下载',
  },
  Pan: {
    ja: 'パン',
    zh: '平移',
  },
  'Realtime 3D asset': {
    ja: 'リアルタイム3Dアセット',
    zh: '实时 3D 资产',
  },
  'Source package': {
    ja: 'ソースパッケージ',
    zh: '源文件包',
  },
  'Static showcase': {
    ja: '静止画展示',
    zh: '静态展示',
  },
  'Scene study': {
    ja: '背景習作',
    zh: '场景练习',
  },
  'Texture view': {
    ja: 'テクスチャ表示',
    zh: '贴图视图',
  },
  'Under 10 MB': {
    ja: '10 MB未満',
    zh: '10 MB 以下',
  },
  Wireframe: {
    ja: 'ワイヤー',
    zh: '线框',
  },
  Zoom: {
    ja: 'ズーム',
    zh: '缩放',
  },
  '3D Asset Production Workflow': {
    ja: '3Dアセット制作フロー',
    zh: '三维资产制作流程',
  },
}

export const translateKnownLabel = (value, language = defaultLanguage) => {
  if (!value || language === 'en') return value || ''
  const direct = labelTranslations[value]?.[language]
  if (direct) return direct

  const normalized = String(value).trim()
  const caseMatch = Object.entries(labelTranslations).find(
    ([label]) => label.toLowerCase() === normalized.toLowerCase(),
  )
  if (caseMatch?.[1]?.[language]) return caseMatch[1][language]

  const modelFormat = normalized.match(/^([a-z0-9]+)\s+model$/i)
  if (modelFormat) {
    const format = modelFormat[1].toUpperCase()
    return language === 'ja' ? `${format}モデル` : `${format} 模型`
  }

  const previewImage = normalized.match(/^([a-z0-9]+)\s+preview image$/i)
  if (previewImage) {
    const format = previewImage[1].toUpperCase()
    return language === 'ja' ? `${format}プレビュー画像` : `${format} 预览图`
  }

  return value
}
