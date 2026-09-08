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
  charcoal: { background: '#17181c', label: 'Charcoal' },
  ink: { background: '#0b0b10', label: 'Ink' },
  midnight: { background: '#0d1117', label: 'Midnight' },
  slate: { background: '#141a22', label: 'Slate' },
})

export const THEME_FONTS = Object.freeze({
  mono: { label: 'Mono', stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace" },
  sans: { label: 'Sans', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: 'Serif', stack: "'Georgia', ui-serif, Cambria, serif" },
})

export const DEFAULT_THEME = Object.freeze({
  accent: '#7dd3fc',
  font: 'sans',
  surface: 'midnight',
})

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
  if (!THEME_SURFACES[surface]) {
    errors.push(`surface must be one of: ${Object.keys(THEME_SURFACES).join(', ')}.`)
  }

  const font = String(source.font ?? DEFAULT_THEME.font).trim().toLowerCase()
  if (!THEME_FONTS[font]) {
    errors.push(`font must be one of: ${Object.keys(THEME_FONTS).join(', ')}.`)
  }

  const accent = String(source.accent ?? DEFAULT_THEME.accent).trim().toLowerCase()
  if (!HEX_PATTERN.test(accent)) {
    errors.push('accent must be a six-digit hex colour, like #7dd3fc.')
  } else if (THEME_SURFACES[surface]) {
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

  return {
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
