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

export const seriesMeta = [
  { key: 'comments', label: 'Comments', color: chartPalette.categorical[0] },
  { key: 'likes', label: 'Likes', color: chartPalette.categorical[1] },
  { key: 'downloads', label: 'Downloads', color: chartPalette.categorical[2] },
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

// Big numbers are read, not audited: 12.9K beats 12,914 in a stat tile. Exact
// values stay reachable in the tooltip and the table view.
export const compactNumber = (value) => {
  const number = Number(value) || 0
  if (Math.abs(number) < 1000) return String(number)
  if (Math.abs(number) < 1_000_000) {
    return `${(number / 1000).toFixed(number % 1000 === 0 ? 0 : 1)}K`
  }

  return `${(number / 1_000_000).toFixed(1)}M`
}

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0)

export const formatBytes = (value) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }

  return `${size.toFixed(size >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`

  return `${total}s`
}

// "11 days" is the number that turns a queue depth into a priority, so ages are
// spelled out rather than left as timestamps.
export const formatAge = (value) => {
  if (!value) return ''

  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`

  return `${Math.floor(seconds / (86400 * 30))}mo ago`
}

// The mirror of formatAge for timestamps that have not happened yet. Session
// expiry ran through formatAge and came out as "expires just now", because
// that helper clamps negatives away -- correct for ages, a lie for deadlines.
export const formatCountdown = (value) => {
  if (!value) return ''

  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((then - Date.now()) / 1000)
  if (seconds <= 0) return 'expired'
  if (seconds < 60) return 'in under a minute'
  if (seconds < 3600) return `in ${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `in ${Math.floor(seconds / 3600)}h`

  return `in ${Math.floor(seconds / 86400)}d`
}

export const formatDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return day

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

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
