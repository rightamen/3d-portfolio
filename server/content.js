export const profile = {
  name: 'Right',
  handle: 'rightamen',
  domain: 'mrright.blog',
  email: 'adieb623@gmail.com',
  location: 'China',
  title: '三维模型与游戏美术资产创作者',
  titleEn: '3D model and game art asset creator',
  titleJa: '3Dモデル・ゲームアートアセット制作者',
  intro:
    '我专注于角色、道具、场景等三维模型资产，重视造型、材质、贴图和最终画面表现。',
  introEn:
    'I focus on 3D assets for characters, props, and scenes, with attention to form, material response, texture color, and final presentation.',
  introJa:
    'キャラクター、小物、背景の3Dアセットを中心に、造形、質感、テクスチャ色、最終的な見え方を大切にしています。',
  aboutZh:
    '我是一名模型创作者，主要制作角色、道具与场景资产，关注形体语言、拓扑结构、材质贴图与光影表现。',
  aboutEn:
    'I am a model creator focused on characters, props, and scene assets, with attention to form language, topology, materials, textures, and lighting.',
  aboutJa:
    'キャラクター、小物、背景アセットを制作するモデルクリエイターです。形、トポロジー、マテリアル、テクスチャ、ライティングを大切にしています。',
  highlights: [
    '角色与道具建模',
    '次世代与手绘资产',
    '材质贴图与灯光表现',
  ],
  socials: [
    { label: 'GitHub', href: 'https://github.com/rightamen' },
    { label: 'Email', href: 'mailto:adieb623@gmail.com' },
  ],
}

export const projects = [
  {
    assetCategory: 'next-gen-prop',
    slug: 'fire-extinguisher-next-gen',
    title: 'Next-Gen Fire Extinguisher',
    titleZh: '次世代灭火器',
    titleJa: '次世代消火器',
    image: '/assets/projects/fire-extinguisher.png',
    modelUrl: '/models/fire-extinguisher.glb',
    summary:
      'A real FBX production asset converted into a GLB model preview with embedded PBR texture maps for asset presentation.',
    summaryZh:
      '真实 FBX 生产资产转换为 GLB 模型预览，保留 PBR 贴图用于作品展示。',
    summaryJa:
      '実制作FBXアセットをGLBモデルプレビューに変換し、PBRテクスチャを保持した展示用作品です。',
    workflow:
      'The original FBX asset was prepared from a 3ds Max workflow, paired with Substance-style PBR maps, downsampled to 2K for realtime preview, then exported through Blender as a Draco-compressed GLB.',
    workflowZh:
      '原始 FBX 来自 3ds Max 制作流程，配合 Substance 风格 PBR 贴图，降采样到 2K 后通过 Blender 导出为 Draco 压缩 GLB。',
    workflowJa:
      '元のFBXは3ds Maxワークフローで作成し、Substance系PBRマップを組み合わせ、2Kに調整してBlenderからDraco圧縮GLBとして書き出しました。',
    format: 'GLB / PBR',
    modelSize: '11.1 MB GLB preview',
    modelSizeZh: '11.1 MB GLB 预览',
    modelSizeJa: '11.1 MB GLBプレビュー',
    downloadPolicy: 'Authorization required',
    downloadPolicyZh: '需要授权',
    downloadPolicyJa: '許可が必要',
    viewerFeatures: [
      'Orbit',
      'Zoom',
      'Pan',
      'Texture view',
      'Clay view',
      'Wireframe',
      'Auto rotate',
      'Grid floor',
    ],
    stack: ['3ds Max', 'FBX', 'PBR', 'GLB'],
    year: '2026',
  },
  {
    assetCategory: 'next-gen-character',
    slug: 'creature-accessories',
    title: 'Character Accessory Study',
    titleZh: '角色配饰练习',
    titleJa: 'キャラクター装飾習作',
    image: '/assets/projects/accessories.jpg',
    summary:
      'A character accessory study focused on silhouette, ornament rhythm, and material contrast.',
    summaryZh:
      '角色配饰方向的练习，重点关注轮廓、装饰节奏和材质对比。',
    summaryJa:
      'シルエット、装飾リズム、素材コントラストを重視したキャラクター装飾の習作です。',
    workflow:
      'Modeled as a shape-language study for character decoration, material contrast, and readable detail.',
    workflowZh:
      '作为角色装饰、材质对比和细节可读性的造型语言练习进行制作。',
    workflowJa:
      'キャラクター装飾、素材コントラスト、読みやすいディテールのための造形練習として制作しました。',
    format: 'Accessory study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['ZBrush', 'Maya', 'Substance Painter'],
    year: '2026',
  },
  {
    assetCategory: 'next-gen-scene',
    slug: 'realtime-game-prototype',
    title: 'Realtime Game Prototype',
    titleZh: '实时场景原型',
    titleJa: 'リアルタイム背景プロトタイプ',
    image: '/assets/projects/game-engine.jpg',
    summary:
      'A performance-minded scene prototype exploring readable forms, lighting rhythm, and asset composition.',
    summaryZh:
      '面向实时展示的场景原型，探索可读形体、灯光节奏和资产组合。',
    summaryJa:
      'リアルタイム表示を意識した背景プロトタイプ。読みやすい形、光のリズム、アセット構成を探っています。',
    workflow:
      'Realtime composition study focused on asset readability and scene lighting.',
    workflowZh:
      '以资产可读性和场景灯光为核心的实时构图练习。',
    workflowJa:
      'アセットの読みやすさと背景ライティングを中心にしたリアルタイム構図練習です。',
    format: 'Image case study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['Environment Art', 'Optimization', 'Lighting'],
    year: '2025',
  },
  {
    assetCategory: 'next-gen-character',
    slug: 'product-interface-system',
    title: 'Character Material Study',
    titleZh: '角色材质练习',
    titleJa: 'キャラクターマテリアル習作',
    image: '/assets/projects/blazor-app.jpg',
    summary:
      'A character-focused material study exploring skin, fabric, hair, and readable surface separation.',
    summaryZh:
      '角色材质方向的练习，探索皮肤、布料、头发和清晰的材质分区。',
    summaryJa:
      '肌、布、髪、表面の分かりやすい分離を探るキャラクターマテリアル習作です。',
    workflow:
      'Prepared as a visual study for character material hierarchy, color grouping, and presentation polish.',
    workflowZh:
      '用于练习角色材质层级、颜色分组和展示完成度。',
    workflowJa:
      'キャラクターのマテリアル階層、色分け、展示品質を確認するビジュアル習作として制作しました。',
    format: 'Material study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['Character Art', 'Material Study', 'Lighting'],
    year: '2025',
  },
  {
    assetCategory: 'hand-painted-scene',
    slug: 'learning-visual-system',
    title: 'Hand-Painted Scene Study',
    titleZh: '手绘场景练习',
    titleJa: '手描き背景習作',
    image: '/assets/projects/elearning.jpg',
    summary:
      'A hand-painted scene study focused on color mood, spatial readability, and stylized atmosphere.',
    summaryZh:
      '手绘场景方向的练习，重点关注色彩氛围、空间阅读和风格化表现。',
    summaryJa:
      '色の雰囲気、空間の読みやすさ、スタイライズ表現を重視した手描き背景習作です。',
    workflow:
      'Built as an environment composition pass with emphasis on painted color, lighting mood, and shape clarity.',
    workflowZh:
      '作为环境构图练习制作，强调手绘色彩、灯光氛围和形体清晰度。',
    workflowJa:
      '背景構図の練習として制作し、手描きの色、光の雰囲気、形の明瞭さを重視しました。',
    format: 'Scene study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['Hand-Painted', 'Environment Art', 'Composition'],
    year: '2024',
  },
]

export const experience = [
  {
    period: '2025 - Now',
    title: '独立模型创作者',
    titleEn: 'Independent Model Creator',
    titleJa: '個人モデルクリエイター',
    body:
      '持续制作角色、道具与场景资产，重点打磨模型结构、材质表现、贴图细节和展示效果。',
    bodyEn:
      'Creating character, prop, and scene assets while refining model structure, material response, texture detail, and presentation quality.',
    bodyJa:
      'キャラクター、小物、背景アセットを制作しながら、モデル構造、質感、テクスチャ細部、展示品質を磨いています。',
  },
  {
    period: '2024 - 2025',
    title: '三维资产制作流程',
    titleEn: '3D Asset Production Workflow',
    titleJa: '3Dアセット制作フロー',
    body:
      '建立从高模、低模、拓扑、UV、贴图到最终展示的制作流程，提升资产完成度和表现稳定性。',
    bodyEn:
      'Built a workflow from high poly, low poly, topology, UVs, and textures to final presentation, improving asset completion and consistency.',
    bodyJa:
      'ハイポリ、ローポリ、トポロジー、UV、テクスチャから最終展示までの流れを整え、アセットの完成度と安定性を高めています。',
  },
  {
    period: '2023 - 2024',
    title: '美术与造型基础',
    titleEn: 'Art And Form Fundamentals',
    titleJa: '美術と造形の基礎',
    body:
      '围绕比例、轮廓、结构、色彩和材质关系积累基础能力，用于支撑角色、道具和场景创作。',
    bodyEn:
      'Practiced proportion, silhouette, structure, color, and material relationships to support character, prop, and scene creation.',
    bodyJa:
      '比率、シルエット、構造、色、素材関係を学び、キャラクター、小物、背景制作の基礎にしています。',
  },
]

export const skills = [
  'ZBrush',
  'Maya',
  'Blender',
  '3ds Max',
  'Substance Painter',
  'Photoshop',
  'Marmoset Toolbag',
]
