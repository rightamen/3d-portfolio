export const profile = {
  name: 'Right',
  handle: 'rightamen',
  domain: 'mrright.blog',
  email: 'adieb623@gmail.com',
  location: 'China',
  title: '3D Artist and realtime portfolio creator',
  intro:
    'I create sculptural digital forms, realtime presentation scenes, and portfolio systems that make 3D work feel clear, crafted, and alive on the web.',
  aboutZh:
    '我是一名以三维空间为主要媒介的数字艺术创作者，专注于形体语言、视觉结构、材质与光影之间的表达。',
  highlights: [
    'Character and prop modeling',
    'Realtime 3D web presentation',
    'Material, light, and visual storytelling',
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
      'A real FBX production asset converted into a web-ready GLB preview with embedded PBR texture maps for viewer testing.',
    workflow:
      'The original FBX asset was prepared from a 3ds Max workflow, paired with Substance-style PBR maps, downsampled to 2K for web delivery, then exported through Blender as a Draco-compressed GLB.',
    format: 'GLB / PBR',
    modelSize: '11.1 MB web preview',
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
    assetCategory: 'generic',
    slug: 'creature-accessories',
    title: 'Creature Accessory Study',
    image: '/assets/projects/accessories.jpg',
    summary:
      'A detail-focused sculptural pass balancing silhouette, ornament, and material contrast for character presentation.',
    workflow:
      'A focused visual study for accessory shape language and material contrast.',
    format: 'Image case study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['ZBrush', 'Maya', 'Substance'],
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
    stack: ['Three.js', 'Optimization', 'Lighting'],
    year: '2025',
  },
  {
    assetCategory: 'generic',
    slug: 'product-interface-system',
    title: 'Product Interface System',
    image: '/assets/projects/blazor-app.jpg',
    summary:
      'A structured interface concept for technical workflows, built around clean hierarchy and responsive behavior.',
    workflow:
      'Interface system exploration for technical products and workflow-heavy screens.',
    format: 'UI case study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['React', 'Blazor', 'Design Systems'],
    year: '2025',
  },
  {
    assetCategory: 'generic',
    slug: 'learning-visual-system',
    title: 'Learning Visual System',
    image: '/assets/projects/elearning.jpg',
    summary:
      'A modular visual direction for long-form content, combining clean layouts with spatial image language.',
    workflow:
      'Visual design system for structured content and learning-oriented layouts.',
    format: 'Visual case study',
    modelSize: 'Static showcase',
    downloadPolicy: 'Unavailable',
    viewerFeatures: ['Case study'],
    stack: ['Composition', 'Branding', 'Web'],
    year: '2024',
  },
]

export const experience = [
  {
    period: '2025 - Now',
    title: 'Independent 3D Artist',
    body:
      'Creating character accessories, sculptural studies, and web-ready portfolio pieces with a focus on presentation polish.',
  },
  {
    period: '2024 - 2025',
    title: 'Realtime Asset Workflow',
    body:
      'Built a practical pipeline across ZBrush, Maya, Blender, and browser-based 3D previews for faster iteration.',
  },
  {
    period: '2023 - 2024',
    title: 'Digital Design Foundations',
    body:
      'Combined frontend development and visual design practice to present technical work through responsive interfaces.',
  },
]

export const skills = [
  'ZBrush',
  'Maya',
  'Blender',
  '3ds Max',
  'Three.js',
  'React',
  'Tailwind CSS',
  'Node.js',
]
