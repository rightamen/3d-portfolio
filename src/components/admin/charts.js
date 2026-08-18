// Chart tokens and geometry helpers, kept out of the component file so the
// palette has exactly one home.
//
// The three categorical hues are not eyeballed brand colours -- they are the
// brand hues (aqua, coral, lavender) re-stepped in OKLCH until all six palette
// checks pass against this dashboard's panel surface (#101321) in dark mode:
// lightness band, chroma floor, CVD separation (worst adjacent pair ΔE 12.9
// under deuteranopia, target is 8), the normal-vision floor, and >= 3:1
// contrast against the surface. Changing a value here means re-running that
// validation -- the raw brand hues themselves FAIL the lightness band, which
// is why these are not simply `--color-aqua` and friends.
export const chartPalette = {
  // Fixed slot order. Assigned in sequence, never cycled: a fourth series is a
  // design decision, not a generated hue.
  categorical: ['#00a3ad', '#c01762', '#8b7af0'],
  // Single-series marks (sparklines, bar lists) use the accent, which does not
  // have to clear the adjacency checks because nothing sits next to it.
  accent: '#33c2cc',
  // Everything that is not data: gridlines, axes, the de-emphasised half of a
  // sparkline. One step off the surface, recessive by construction.
  grid: 'rgba(255, 255, 255, 0.09)',
  muted: 'rgba(154, 164, 191, 0.55)',
  // The surface itself. The 2px gaps between stacked segments are painted in
  // this colour, so it has to match the panel behind the chart exactly.
  surface: '#101321',
}

// Colours are fixed; the names are looked up per language by the caller.
export const seriesMeta = [
  { color: chartPalette.categorical[0], key: 'comments', labelKey: 'series.comments' },
  { color: chartPalette.categorical[1], key: 'likes', labelKey: 'series.likes' },
  { color: chartPalette.categorical[2], key: 'downloads', labelKey: 'series.downloads' },
]

// Axis ticks land on round numbers, never on the raw maximum: "1,000" is a
// number a reader can carry to the next gridline, "873" is not.
export const niceCeiling = (value) => {
  if (!Number.isFinite(value) || value <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude

  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10

  return step * magnitude
}

// The scale is built from a rounded *step*, not by dividing a rounded ceiling:
// dividing 50 into four gives ticks at 12.5 and 37.5, and half an event is not
// a thing that can happen. Rounding the step first keeps every tick a whole
// number and moves the top gridline up to meet it.
//
// minStep exists because every series on this dashboard is a count of things
// that happened. On a quiet week the maximum is 0 or 1 and a purely
// proportional scale answers with ticks at 0.5 and 1.5 -- half a comment.
export const niceScale = (max, count = 4, { minStep = 1 } = {}) => {
  const step = Math.max(minStep, niceCeiling(Math.max(1, max) / count))
  const ticks = Array.from({ length: count + 1 }, (_, index) => step * index)

  return { step, ticks, top: step * count }
}

// Number, byte, date and duration formatting moved to createAdminFormatters()
// in lib/admin/i18nAdmin.js when the console learned to speak three languages:
// every one of the helpers that used to live here hard-coded en-US and English
// unit words ("11 days ago"), which is exactly the kind of string that has to
// change with the interface language.

// A rectangle with only its top two corners rounded: the 4px data-end of a
// column, square where it meets the baseline.
export const roundedTopRect = (x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height))

  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ')
}

// Percentage change against the previous window of equal length. Returns null
// rather than Infinity when there is no baseline: "up 100%" from zero is a
// sentence that means nothing, and the tile says "new" instead.
export const percentChange = (current, prior) => {
  const now = Number(current) || 0
  const before = Number(prior) || 0

  if (before === 0) return now === 0 ? 0 : null

  return Math.round(((now - before) / before) * 100)
}
