// Everything the Projects editor offers as a canned choice: the language
// matrix, the preset buttons, and the shape of an empty form.

import { assetCategoryProfiles } from '../assetCategories'

export const localizedEditorLanguages = [
  { label: '中文', suffix: 'Zh' },
  { label: 'English', suffix: 'En' },
  { label: '日本語', suffix: 'Ja' },
]

export const localizedEditorFields = [
  { key: 'title', label: 'Title' },
  { key: 'summary', label: 'Summary', multiline: true },
  { key: 'workflow', label: 'Workflow', multiline: true },
  { key: 'format', label: 'Format' },
  { key: 'modelSize', label: 'Model Size' },
  { key: 'downloadPolicy', label: 'Download Policy' },
]

export const coreTranslationFields = ['title', 'summary', 'workflow']

export const translationFilters = [
  { label: 'All translation states', value: 'all' },
  { label: 'Missing English', value: 'missing-En' },
  { label: 'Missing Japanese', value: 'missing-Ja' },
  { label: 'Missing Any Region', value: 'missing-any' },
]

export const getTranslationState = (project, suffix) => {
  // English is the unsuffixed field, not `titleEn`. pickLocalized() reads
  // `title` for English and falls back to it for every other language, so a
  // project with full English copy and no `titleEn` is complete -- it used to
  // be reported as "EN fallback", which was every project ever written and
  // taught everyone to ignore these chips.
  const fields =
    suffix === 'En'
      ? coreTranslationFields
      : coreTranslationFields.map((field) => `${field}${suffix}`)

  const filledCount = fields.filter((field) => String(project?.[field] || '').trim()).length

  if (filledCount === fields.length) return 'ready'
  if (filledCount > 0) return 'partial'
  return 'fallback'
}

export const getTranslationStates = (project) =>
  localizedEditorLanguages.map((language) => ({
    ...language,
    state: getTranslationState(project, language.suffix),
  }))

export const isMissingTranslation = (project, suffix) =>
  getTranslationState(project, suffix) !== 'ready'

export const matchesTranslationFilter = (project, filter) => {
  if (filter === 'missing-En') return isMissingTranslation(project, 'En')
  if (filter === 'missing-Ja') return isMissingTranslation(project, 'Ja')
  if (filter === 'missing-any') {
    return localizedEditorLanguages.some((language) =>
      isMissingTranslation(project, language.suffix),
    )
  }

  return true
}

export const downloadPolicyPresets = [
  { label: 'Open Download', value: 'Open download' },
  { label: 'Member Download', value: 'Member download' },
  { label: 'Approved Download', value: 'Approved download' },
]

export const assetCategoryPresets = assetCategoryProfiles.map((category) => ({
  label: category.label,
  value: category.value,
}))

export const projectPresets = [
  {
    key: 'game-prop',
    label: 'Next-Gen Prop',
    values: {
      assetCategory: 'next-gen-prop',
      downloadPolicy: downloadPolicyPresets[2].value,
      format: 'Realtime 3D asset',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, FBX, PBR, GLB',
      summary: 'A production-ready realtime prop with optimized topology, PBR materials, and asset presentation.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view, Wireframe',
      workflow:
        'Modeled and UV prepared for a realtime workflow, then converted into a compressed model preview with PBR texture maps preserved.',
    },
  },
  {
    key: 'environment',
    label: 'Next-Gen Scene',
    values: {
      assetCategory: 'next-gen-scene',
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Environment scene',
      modelSize: 'Auto-detected after upload',
      stackText: 'Environment Art, Lighting, PBR, Optimization',
      summary: 'A compact environment showcase focused on composition, lighting, materials, and web performance.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Lighting preview, Wireframe',
      workflow:
        'Built as a scene presentation with optimized geometry, compressed textures, and a browser-friendly model export.',
    },
  },
  {
    key: 'character',
    label: 'Next-Gen Character',
    values: {
      assetCategory: 'next-gen-character',
      downloadPolicy: downloadPolicyPresets[2].value,
      format: 'Character model',
      modelSize: 'Auto-detected after upload',
      stackText: 'Character Art, Retopology, UV, PBR',
      summary: 'A character-focused 3D study presenting silhouette, material response, and realtime model preparation.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Prepared from high-level sculpt/modeling work into a clean presentation asset with readable materials and optimized preview settings.',
    },
  },
  {
    key: 'hand-painted-character',
    label: 'Hand-Painted Character',
    values: {
      assetCategory: 'hand-painted-character',
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Hand-painted character',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, OBJ, Hand-Painted, GLB',
      summary: 'A hand-painted asset preview focused on clean texture color, silhouette, and readable shape language.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Built with painted texture presentation in mind, then converted into a model preview that preserves the authored color map.',
    },
  },
  {
    key: 'hand-painted-scene',
    label: 'Hand-Painted Scene',
    values: {
      assetCategory: 'hand-painted-scene',
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Hand-painted scene',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, OBJ, Hand-Painted, Environment, GLB',
      summary:
        'A hand-painted environment or scene study focused on color mood, readable composition, and stylized atmosphere.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Built with painted texture and composition-first presentation in mind, then converted into a model preview that preserves authored color and atmosphere.',
    },
  },
  {
    key: 'case-study',
    label: 'Case Study',
    values: {
      assetCategory: 'generic',
      downloadPolicy: downloadPolicyPresets[0].value,
      format: 'Image case study',
      modelSize: 'Static showcase',
      stackText: '3D, Rendering, Portfolio',
      summary: 'A visual case study documenting the project result, production choices, and final presentation.',
      viewerFeaturesText: 'Case study',
      workflow:
        'Presented as a still-image breakdown with concise production notes and portfolio-ready context.',
    },
  },
]

export const formatPresets = [
  'Realtime 3D asset',
  'GLB model',
  'FBX model',
  'OBJ model',
  'Environment scene',
  'Character model',
  'Hand-painted scene',
  'Image case study',
]

export const modelSizePresets = [
  'Auto-detected after upload',
  'Static showcase',
  'Under 10 MB',
  '10-50 MB',
  '50-120 MB',
  'Source package',
]

export const stackKeywordPresets = [
  '3ds Max',
  'FBX',
  'PBR',
  'GLB',
  'Realtime',
  'Game Asset',
  'Hard Surface',
  'Texture Baking',
  'Optimization',
]

export const viewerFeaturePresets = [
  'Orbit',
  'Zoom',
  'Pan',
  'Texture view',
  'Clay view',
  'Wireframe',
  'Auto rotate',
  'Grid floor',
  'Case study',
]

export const emptyUploadStatus = {
  image: { phase: 'idle', progress: 0, message: '' },
  modelUrl: { phase: 'idle', progress: 0, message: '' },
}

export const emptyProjectForm = () => ({
  assetCategory: 'generic',
  downloadPolicy: downloadPolicyPresets[2].value,
  format: 'Image case study',
  image: '/assets/projects/accessories.jpg',
  isNew: true,
  isPublic: true,
  modelSize: 'Static showcase',
  modelUrl: '',
  slug: '',
  stackText: '3D, Web',
  summary: '',
  title: '',
  viewerFeaturesText: 'Case study',
  workflow: '',
  year: String(new Date().getFullYear()),
  ...Object.fromEntries(
    localizedEditorFields.flatMap((field) =>
      localizedEditorLanguages.map((language) => [`${field.key}${language.suffix}`, '']),
    ),
  ),
})
