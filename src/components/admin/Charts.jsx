import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  chartPalette,
  compactNumber,
  formatDay,
  formatNumber,
  niceScale,
  roundedTopRect,
} from './charts'

// Charts are drawn at real pixel size rather than scaled from a fixed viewBox.
// A viewBox that stretches would scale the 2px surface gaps and the 4px data
// ends with it, and those two numbers are the whole reason the marks read as
// separate objects.
const useElementWidth = (fallback = 640) => {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect?.width || 0)
      if (next > 0) setWidth(next)
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

// A stat tile's trend line. No axis, no labels, no tooltip: it exists to say
// "roughly this shape", and the exact numbers live in the tile's value and the
// chart below it.
export const Sparkline = ({ accent = chartPalette.accent, height = 34, points = [] }) => {
  const gradientId = useId()
  const width = 120
  const values = points.length ? points : [0]
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : width

  const coords = values.map((value, index) => [
    index * step,
    height - 2 - (value / max) * (height - 6),
  ])

  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  const last = coords[coords.length - 1]

  return (
    <svg
      aria-hidden="true"
      className="admin-sparkline"
      focusable="false"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          {/* A wash, never a saturated block. */}
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      {last ? (
        <circle
          cx={last[0]}
          cy={last[1]}
          fill={accent}
          r="3"
          stroke={chartPalette.surface}
          strokeWidth="2"
        />
      ) : null}
    </svg>
  )
}

// Daily activity, three series stacked. The stack is the right form here
// because the question is "how busy was the site" first and "busy with what"
// second -- the total is the silhouette, the composition is the fill.
export const StackedColumns = ({
  data = [],
  emptyLabel = 'No activity in this window yet.',
  height = 240,
  series = [],
  title,
}) => {
  const [wrapRef, width] = useElementWidth()
  const [hovered, setHovered] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const padding = { bottom: 26, left: 44, right: 12, top: 12 }
  const plotWidth = Math.max(80, width - padding.left - padding.right)
  const plotHeight = Math.max(60, height - padding.top - padding.bottom)

  const totals = useMemo(
    () => data.map((row) => series.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0)),
    [data, series],
  )

  const grandTotal = totals.reduce((sum, value) => sum + value, 0)
  const { ticks, top: domainMax } = niceScale(Math.max(...totals, 0))
  const band = data.length ? plotWidth / data.length : plotWidth
  // Capped, never filling the slot: the leftover band is the air that keeps a
  // 90-day range from reading as a solid block.
  const barWidth = Math.max(3, Math.min(24, band - 4))
  const scale = (value) => (value / domainMax) * plotHeight

  const hoveredRow = hovered === null ? null : data[hovered]

  const handlePointer = useCallback(
    (event) => {
      if (!data.length) return

      const bounds = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - bounds.left - padding.left
      const index = Math.floor(x / band)

      setHovered(index >= 0 && index < data.length ? index : null)
    },
    [band, data.length, padding.left],
  )

  return (
    <div className="admin-chart">
      <div className="admin-chart-head">
        <div>
          <h3>{title}</h3>
          {/* Legend is always present for two or more series -- identity never
              rests on colour matching alone. */}
          <div className="admin-chart-legend">
            {series.map((item) => (
              <span key={item.key}>
                <i style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <button
          className="admin-chip-button"
          onClick={() => setShowTable((current) => !current)}
          type="button"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="admin-chart-table-wrap">
          <table className="admin-chart-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                {series.map((item) => (
                  <th key={item.key} scope="col">
                    {item.label}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={row.day}>
                  <th scope="row">{formatDay(row.day)}</th>
                  {series.map((item) => (
                    <td key={item.key}>{formatNumber(row[item.key])}</td>
                  ))}
                  <td>{formatNumber(totals[index])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-chart-plot" ref={wrapRef}>
          <svg
            aria-label={`${title}: ${formatNumber(grandTotal)} events across ${data.length} days`}
            height={height}
            onPointerLeave={() => setHovered(null)}
            onPointerMove={handlePointer}
            role="img"
            width={width}
          >
            {ticks.map((tick) => {
              const y = padding.top + plotHeight - scale(tick)

              return (
                <g key={tick}>
                  <line
                    stroke={chartPalette.grid}
                    strokeWidth="1"
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                  />
                  <text className="admin-chart-tick" dy="0.32em" textAnchor="end" x={padding.left - 8} y={y}>
                    {compactNumber(tick)}
                  </text>
                </g>
              )
            })}

            {data.map((row, index) => {
              const x = padding.left + index * band + (band - barWidth) / 2
              const stack = []
              let cursor = 0

              series.forEach((item, order) => {
                const value = Number(row[item.key]) || 0
                if (value <= 0) return

                const bottom = padding.top + plotHeight - scale(cursor)
                const top = padding.top + plotHeight - scale(cursor + value)
                // A 2px strip of the surface separates touching segments. The
                // gap is what makes two neighbouring fills read as two marks;
                // an outline would add ink that is not data.
                const gap = stack.length ? 2 : 0
                stack.push({ bottom: bottom - gap, color: item.color, order, top })
                cursor += value
              })

              const isHovered = hovered === index

              return (
                <g key={row.day} opacity={hovered === null || isHovered ? 1 : 0.45}>
                  {stack.map((segment, segmentIndex) => {
                    const segmentHeight = Math.max(1, segment.bottom - segment.top)
                    const isTop = segmentIndex === stack.length - 1

                    return isTop ? (
                      <path
                        d={roundedTopRect(x, segment.top, barWidth, segmentHeight, 4)}
                        fill={segment.color}
                        key={segment.order}
                      />
                    ) : (
                      <rect
                        fill={segment.color}
                        height={segmentHeight}
                        key={segment.order}
                        width={barWidth}
                        x={x}
                        y={segment.top}
                      />
                    )
                  })}
                </g>
              )
            })}

            <line
              stroke={chartPalette.grid}
              strokeWidth="1"
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + plotHeight}
              y2={padding.top + plotHeight}
            />

            {data.length ? (
              <>
                <text className="admin-chart-tick" x={padding.left} y={height - 8}>
                  {formatDay(data[0].day)}
                </text>
                <text
                  className="admin-chart-tick"
                  textAnchor="end"
                  x={width - padding.right}
                  y={height - 8}
                >
                  {formatDay(data[data.length - 1].day)}
                </text>
              </>
            ) : null}

            {grandTotal === 0 ? (
              <text
                className="admin-chart-empty"
                textAnchor="middle"
                x={padding.left + plotWidth / 2}
                y={padding.top + plotHeight / 2}
              >
                {emptyLabel}
              </text>
            ) : null}
          </svg>

          {hoveredRow ? (
            <div
              className="admin-chart-tooltip"
              style={{
                left: Math.min(
                  Math.max(padding.left + hovered * band + band / 2, 90),
                  Math.max(width - 90, 90),
                ),
              }}
            >
              <strong>{formatDay(hoveredRow.day)}</strong>
              {series.map((item) => (
                <span key={item.key}>
                  <i style={{ background: item.color }} />
                  <b>{formatNumber(hoveredRow[item.key])}</b>
                  {item.label}
                </span>
              ))}
              <span className="admin-chart-tooltip-total">
                <b>{formatNumber(totals[hovered])}</b>total
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// Ranked magnitude. Nominal categories, so every bar wears the same hue --
// colouring them by value would spend the identity channel re-encoding what
// the bar length already says.
export const BarList = ({ emptyLabel = 'Nothing here yet.', items = [], unit = '' }) => {
  const max = Math.max(1, ...items.map((item) => item.value))

  if (!items.length) {
    return <p className="admin-empty-note">{emptyLabel}</p>
  }

  return (
    <ul className="admin-bar-list">
      {items.map((item) => (
        <li key={item.id}>
          <div className="admin-bar-list-head">
            <span title={item.label}>{item.label}</span>
            <strong>
              {formatNumber(item.value)}
              {unit ? ` ${unit}` : ''}
            </strong>
          </div>
          <div className="admin-bar-track">
            <div
              className="admin-bar-fill"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.detail ? <small>{item.detail}</small> : null}
        </li>
      ))}
    </ul>
  )
}

// One ratio against its limit. The unfilled track is a lighter step of the same
// ramp rather than plain grey, so the whole bar carries the reading.
export const Meter = ({ label, note, total = 0, value = 0 }) => {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeValue = Math.max(0, Number(value) || 0)
  const share = safeTotal > 0 ? Math.min(100, (safeValue / safeTotal) * 100) : 0

  return (
    <div className="admin-meter">
      <div className="admin-meter-head">
        <span>{label}</span>
        <strong>
          {formatNumber(safeValue)}
          <em>/ {formatNumber(safeTotal)}</em>
        </strong>
      </div>
      <div className="admin-meter-track" role="presentation">
        <div className="admin-meter-fill" style={{ width: `${share}%` }} />
      </div>
      {note ? <small>{note}</small> : null}
    </div>
  )
}
