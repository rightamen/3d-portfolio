// Per-creator themes. One definition, shared by the API that validates them
// and the client that renders them, because a theme that the server accepts
// and the client cannot draw is worse than no theme at all.
//
// Deliberately NOT arbitrary CSS. A creator picks an accent colour and two
// presets; everything else is derived. Letting people supply CSS would mean
// letting them restyle the marketplace chrome around their own page, cover the
// report button, or fake a purchase dialog -- and the value of a free-form
// stylesheet is not worth any of that.
//
// The tokens are applied client-side through CSSOM (element.style.setProperty),
// not by injecting a <style> element. The site's CSP checks parsed <style>
// elements and style attributes; property writes through the object model are
// not policed, so this stays inside the policy without a nonce.

// Each surface names a real background colour, because the accent has to be
// checked for contrast against something specific. The values here and the
// ones in src/index.css must agree -- that is what themeSurfaces exports for.
export const THEME_SURFACES = Object.freeze({
  charcoal: { background: '#17181c', label: 'Charcoal', labels: { zh: '石墨灰', en: 'Charcoal', ja: 'チャコール' } },
  ink: { background: '#0b0b10', label: 'Ink', labels: { zh: '墨黑', en: 'Ink', ja: 'インク' } },
  midnight: { background: '#0d1117', label: 'Midnight', labels: { zh: '午夜蓝', en: 'Midnight', ja: 'ミッドナイト' } },
  slate: { background: '#141a22', label: 'Slate', labels: { zh: '冷岩', en: 'Slate', ja: 'スレート' } },
  umber: { background: '#1c1713', label: 'Umber', labels: { zh: '暖褐', en: 'Umber', ja: 'アンバー' } },
  forest: { background: '#111b18', label: 'Forest', labels: { zh: '深林', en: 'Forest', ja: 'フォレスト' } },
  plum: { background: '#20151d', label: 'Plum', labels: { zh: '暮紫', en: 'Plum', ja: 'プラム' } },
  wine: { background: '#201317', label: 'Wine', labels: { zh: '酒红', en: 'Wine', ja: 'ワイン' } },
  paper: { background: '#f1eee6', label: 'Paper', labels: { zh: '暖纸', en: 'Paper', ja: 'ペーパー' } },
  porcelain: { background: '#f3f4f8', label: 'Porcelain', labels: { zh: '瓷白', en: 'Porcelain', ja: 'ポーセリン' } },
})

export const THEME_FONTS = Object.freeze({
  mono: { label: 'Mono', labels: { zh: '等宽', en: 'Mono', ja: '等幅' }, stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace" },
  sans: { label: 'Sans', labels: { zh: '现代无衬线', en: 'Sans', ja: 'ゴシック' }, stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: 'Serif', labels: { zh: '经典衬线', en: 'Serif', ja: 'セリフ' }, stack: "'Georgia', ui-serif, Cambria, serif" },
})

export const DEFAULT_THEME = Object.freeze({
  accent: '#7dd3fc',
  font: 'sans',
  surface: 'midnight',
})

// Presets are combinations of the existing three persisted fields. Selecting
// one requires no schema change and never locks out custom combinations.
export const THEME_PRESETS = Object.freeze([
  { id: 'obsidian', labels: { zh: '黑曜 · 银紫', en: 'Obsidian', ja: '黒曜' }, descriptions: { zh: '墨黑空间，银紫光泽。', en: 'Ink black with a violet gleam.', ja: '漆黒に、すみれ色の光。' }, theme: { accent: '#c4b5fd', surface: 'ink', font: 'sans' } },
  { id: 'graphite', labels: { zh: '石墨 · 冷银', en: 'Graphite', ja: 'グラファイト' }, descriptions: { zh: '克制灰阶，作品优先。', en: 'Quiet greys. The work comes first.', ja: '静かなグレー、作品を主役に。' }, theme: { accent: '#d1d5df', surface: 'charcoal', font: 'sans' } },
  { id: 'ocean', labels: { zh: '深海 · 冰蓝', en: 'Deep Ocean', ja: '深海' }, descriptions: { zh: '深蓝与冰色，清晰利落。', en: 'Deep blue with a crisp icy edge.', ja: '深い青に、澄んだ氷の色。' }, theme: { accent: '#7dd3fc', surface: 'midnight', font: 'sans' } },
  { id: 'amber', labels: { zh: '琥珀 · 暖金', en: 'Amber Atelier', ja: '琥珀' }, descriptions: { zh: '暖褐与金色，经典展览气质。', en: 'Warm umber. A classic gallery mood.', ja: '温かな褐色、クラシックな展示室。' }, theme: { accent: '#e8bd7f', surface: 'umber', font: 'serif' } },
  { id: 'moss', labels: { zh: '苔境 · 森绿', en: 'Moss Studio', ja: '苔のアトリエ' }, descriptions: { zh: '低饱和森绿，自然沉静。', en: 'Muted forest greens, naturally calm.', ja: '落ち着いた緑、自然な静けさ。' }, theme: { accent: '#a5c7a4', surface: 'forest', font: 'sans' } },
  { id: 'rose', labels: { zh: '暮玫 · 烟粉', en: 'Dusk Rose', ja: '夕暮れの薔薇' }, descriptions: { zh: '烟粉点亮暮紫，柔和细腻。', en: 'Dusty rose over a soft plum dusk.', ja: 'プラムの夕景に、淡い薔薇色。' }, theme: { accent: '#e9a7ba', surface: 'plum', font: 'serif' } },
  { id: 'arctic', labels: { zh: '极地 · 青灰', en: 'Arctic Lab', ja: '極地ラボ' }, descriptions: { zh: '冷青与等宽字体，技术美学。', en: 'Cool cyan and precise monospaced type.', ja: '冷たいシアンと、精密な等幅書体。' }, theme: { accent: '#88c8d8', surface: 'slate', font: 'mono' } },
  { id: 'ruby', labels: { zh: '绯夜 · 红玉', en: 'Ruby Night', ja: '紅玉の夜' }, descriptions: { zh: '深酒红与珊瑚光，鲜明有度。', en: 'Wine dark with a measured coral glow.', ja: '深いワイン色に、珊瑚の光。' }, theme: { accent: '#ed8190', surface: 'wine', font: 'sans' } },
  { id: 'paper', labels: { zh: '原纸 · 美术馆', en: 'Paper Gallery', ja: '紙の美術館' }, descriptions: { zh: '温润纸色，像一本艺术画册。', en: 'Warm paper, like an art monograph.', ja: '温かな紙色、画集のように。' }, theme: { accent: '#795431', surface: 'paper', font: 'serif' } },
  { id: 'porcelain', labels: { zh: '瓷白 · 极简', en: 'Porcelain', ja: '白磁' }, descriptions: { zh: '清透浅色，留白与淡紫。', en: 'Airy whites with a violet signature.', ja: '透き通る白と、すみれ色の余白。' }, theme: { accent: '#6550a1', surface: 'porcelain', font: 'sans' } },
])

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

// The accent is used for links, buttons and active states, so it has to be
// legible ON the surface behind it. WCAG's 3:1 floor for user-interface
// components is the right bar -- text would want 4.5, but this colour is never
// body text.
export const MINIMUM_ACCENT_CONTRAST = 3

const channel = (value) => {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = (hex) => {
  const value = hex.replace('#', '')
  const r = channel(Number.parseInt(value.slice(0, 2), 16))
  const g = channel(Number.parseInt(value.slice(2, 4), 16))
  const b = channel(Number.parseInt(value.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (a, b) => {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Validates a theme from a request body.
 *
 * Returns { theme, errors }. Absent keys fall back to the default rather than
 * failing: a client that knows about fewer knobs than the server should still
 * be able to save the ones it does know about.
 */
export const normalizeTheme = (input) => {
  const errors = []
  const source = input && typeof input === 'object' ? input : {}

  const surface = String(source.surface ?? DEFAULT_THEME.surface).trim().toLowerCase()
  if (!Object.hasOwn(THEME_SURFACES, surface)) {
    errors.push(`surface must be one of: ${Object.keys(THEME_SURFACES).join(', ')}.`)
  }

  const font = String(source.font ?? DEFAULT_THEME.font).trim().toLowerCase()
  if (!Object.hasOwn(THEME_FONTS, font)) {
    errors.push(`font must be one of: ${Object.keys(THEME_FONTS).join(', ')}.`)
  }

  const accent = String(source.accent ?? DEFAULT_THEME.accent).trim().toLowerCase()
  if (!HEX_PATTERN.test(accent)) {
    errors.push('accent must be a six-digit hex colour, like #7dd3fc.')
  } else if (Object.hasOwn(THEME_SURFACES, surface)) {
    // Only checkable once the surface is known, which is why this is an else-if
    // rather than a second independent rule.
    const ratio = contrastRatio(accent, THEME_SURFACES[surface].background)
    if (ratio < MINIMUM_ACCENT_CONTRAST) {
      errors.push(
        `accent is too close to the ${surface} background to read ` +
          `(contrast ${ratio.toFixed(1)}:1, needs ${MINIMUM_ACCENT_CONTRAST}:1). Pick a lighter or darker colour.`,
      )
    }
  }

  if (errors.length) return { errors, theme: null }

  return { errors, theme: { accent, font, surface } }
}

// Stored themes are read back through this too: a row written before a preset
// was renamed, or hand-edited in the database, must not be able to put a value
// the client cannot draw into a style property.
export const readStoredTheme = (value) => {
  const { theme } = normalizeTheme(value)
  return theme || { ...DEFAULT_THEME }
}

// The custom properties a theme becomes. Named in one place so the API, the
// client and any future server-rendered version cannot disagree about them.
export const themeToTokens = (theme) => {
  const safe = readStoredTheme(theme)

  const surface = THEME_SURFACES[safe.surface].background
  const light = relativeLuminance(surface) > .5
  // Hex colours only: the same safe palette drives live drafts and saved pages.
  const mix = (base, overlay, weight) => '#' + [1, 3, 5].map(offset => Math.round(
    parseInt(base.slice(offset, offset + 2), 16) * (1 - weight) + parseInt(overlay.slice(offset, offset + 2), 16) * weight,
  ).toString(16).padStart(2, '0')).join('')
  const text = light ? '#252631' : '#e4e4ec'
  return {
    '--theme-text': text,
    '--theme-muted': light ? '#626272' : '#a0a3b4',
    '--theme-panel': mix(surface, light ? '#ffffff' : '#a9a7b8', light ? .55 : .055),
    '--theme-raised': mix(surface, light ? '#ffffff' : '#a9a7b8', light ? .8 : .095),
    '--theme-line': mix(surface, text, light ? .19 : .18),
    '--theme-soft': mix(surface, safe.accent, light ? .08 : .075),
    '--theme-stage': mix(surface, light ? '#ffffff' : '#000000', light ? .3 : .25),
    '--theme-accent': safe.accent,
    '--theme-font': THEME_FONTS[safe.font].stack,
    // What to write ON the accent. A button filled with a bright accent needs
    // dark text and a dark one needs light text; picking one and hoping is how
    // a themed button ends up unreadable for half the palette. Chosen by
    // whichever gives more contrast, not by a luminance threshold, because the
    // threshold is exactly what varies between the two candidates.
    //
    // PURE black, not the site's near-black. The worst case for "better of
    // black and white" is where the two are equal, at (L+0.05)² = 1.05 × 0.05,
    // which works out to 4.58:1 -- above WCAG's 4.5 floor for text, so every
    // possible accent is readable BY CONSTRUCTION. Using #0b0b10 instead cost
    // about 7% and dropped 62 otherwise-valid accents below 4.5, which is how
    // this was found.
    '--theme-on-accent':
      contrastRatio(safe.accent, '#000000') >= contrastRatio(safe.accent, '#ffffff')
        ? '#000000'
        : '#ffffff',
    '--theme-surface': THEME_SURFACES[safe.surface].background,
  }
}


export const getThemeCatalogue = () => ({
  defaults: { ...DEFAULT_THEME },
  fonts: Object.entries(THEME_FONTS).map(([value, item]) => ({ label: item.label, labels: item.labels, value })),
  surfaces: Object.entries(THEME_SURFACES).map(([value, item]) => ({ background: item.background, label: item.label, labels: item.labels, value })),
  presets: THEME_PRESETS.map(preset => ({ ...preset, theme: { ...preset.theme }, themeTokens: themeToTokens(preset.theme) })),
})
