export const profile = {
  name: 'Right',
  handle: 'rightamen',
  domain: 'mrright.blog',
  email: 'adieb623@gmail.com',
  location: 'China',
  title: '三维模型与游戏美术资产创作者',
  intro:
    '我专注于角色、道具、场景等三维模型资产，重视造型、材质、贴图和最终画面表现。',
  aboutZh:
    '我是一名模型创作者，主要制作角色、道具与场景资产，关注形体语言、拓扑结构、材质贴图与光影表现。',
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
    image: '/assets/projects/fire-extinguisher.png',
    modelUrl: '/models/fire-extinguisher.glb',
    summary:
      'A real FBX production asset converted into a GLB model preview with embedded PBR texture maps for asset presentation.',
    workflow:
      'The original FBX asset was prepared from a 3ds Max workflow, paired with Substance-style PBR maps, downsampled to 2K for realtime preview, then exported through Blender as a Draco-compressed GLB.',
    format: 'GLB / PBR',
    modelSize: '11.1 MB GLB preview',
    downloadPolicy: 'Authorization required',
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
    image: '/assets/projects/accessories.jpg',
    summary:
      'A character accessory study focused on silhouette, ornament rhythm, and material contrast.',
    workflow:
      'Modeled as a shape-language study for character decoration, material contrast, and readable detail.',
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
    image: '/assets/projects/game-engine.jpg',
    summary:
      'A performance-minded scene prototype exploring readable forms, lighting rhythm, and asset composition.',
    workflow:
      'Realtime composition study focused on asset readability and scene lighting.',
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
    image: '/assets/projects/blazor-app.jpg',
    summary:
      'A character-focused material study exploring skin, fabric, hair, and readable surface separation.',
    workflow:
      'Prepared as a visual study for character material hierarchy, color grouping, and presentation polish.',
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
    image: '/assets/projects/elearning.jpg',
    summary:
      'A hand-painted scene study focused on color mood, spatial readability, and stylized atmosphere.',
    workflow:
      'Built as an environment composition pass with emphasis on painted color, lighting mood, and shape clarity.',
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
    body:
      '持续制作角色、道具与场景资产，重点打磨模型结构、材质表现、贴图细节和展示效果。',
  },
  {
    period: '2024 - 2025',
    title: '三维资产制作流程',
    body:
      '建立从高模、低模、拓扑、UV、贴图到最终展示的制作流程，提升资产完成度和表现稳定性。',
  },
  {
    period: '2023 - 2024',
    title: '美术与造型基础',
    body:
      '围绕比例、轮廓、结构、色彩和材质关系积累基础能力，用于支撑角色、道具和场景创作。',
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
