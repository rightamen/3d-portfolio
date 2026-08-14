// A small stroked icon set, inline rather than a dependency. Emoji were the
// obvious shortcut here and the wrong one: they render at the whim of the
// platform's font, land at different optical weights next to each other, and
// cannot take the active colour of the nav item they sit in.
const glyphs = {
  alert: { circles: [[12, 12, 9.2]], paths: ['M12 7.5v5.5', 'M12 16.3v.2'] },
  comments: { paths: ['M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  ok: { circles: [[12, 12, 9.2]], paths: ['m8 12.2 2.7 2.7L16.3 9.3'] },
  community: {
    circles: [[9, 8, 3.2]],
    paths: ['M2.5 20v-1.6A4.4 4.4 0 0 1 6.9 14h4.2a4.4 4.4 0 0 1 4.4 4.4V20', 'M16 4.2a3.6 3.6 0 0 1 0 7', 'M17.6 14h.6a4 4 0 0 1 4 4v2'],
  },
  dashboard: { paths: ['M3.5 3.5h6v7h-6z', 'M14.5 3.5h6v4.5h-6z', 'M14.5 12h6v8.5h-6z', 'M3.5 14.5h6v6h-6z'] },
  downloads: { paths: ['M21 15.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5', 'M7.5 10.5 12 15l4.5-4.5', 'M12 15V3'] },
  likes: {
    paths: ['M20.6 5.1a5 5 0 0 0-7.1 0L12 6.6l-1.5-1.5a5 5 0 1 0-7.1 7.1L12 20.8l8.6-8.6a5 5 0 0 0 0-7.1z'],
  },
  messages: { paths: ['M3.5 5.5h17v13h-17z', 'm3.5 7 8.5 6 8.5-6'] },
  projects: { paths: ['M12 2.8 20.5 7v10L12 21.2 3.5 17V7z', 'M3.5 7 12 11.6 20.5 7', 'M12 11.6v9.6'] },
  search: { circles: [[11, 11, 6.4]], paths: ['m20.5 20.5-4.9-4.9'] },
  security: { paths: ['M12 21.5s7.5-3.6 7.5-9.3V5.4L12 2.5 4.5 5.4v6.8c0 5.7 7.5 9.3 7.5 9.3z', 'm9 12 2.2 2.2L15.4 10'] },
  system: { paths: ['M22 12h-4l-2.6 7.5L8.6 4.5 6 12H2'] },
  visitors: { circles: [[12, 8, 3.6]], paths: ['M4.5 20.5v-1.2a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v1.2'] },
}

const AdminIcon = ({ name, size = 17 }) => {
  const glyph = glyphs[name]
  if (!glyph) return null

  return (
    <svg
      aria-hidden="true"
      className="admin-icon"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
    >
      {(glyph.paths || []).map((d) => (
        <path d={d} key={d} />
      ))}
      {(glyph.circles || []).map(([cx, cy, r]) => (
        <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r={r} />
      ))}
    </svg>
  )
}

export default AdminIcon
