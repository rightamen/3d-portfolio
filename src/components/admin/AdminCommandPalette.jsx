import { useEffect, useMemo, useRef, useState } from 'react'

// Keyboard navigation for an admin that now has ten places to be. Opening a
// section used to be "find the pill in the row"; with a grouped sidebar the
// row is gone, and a palette is the honest replacement rather than a
// decoration -- it is also the only way to reach a section without a mouse.
const AdminCommandPalette = ({ commands = [], onClose }) => {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands

    return commands.filter((command) =>
      `${command.label} ${command.hint || ''} ${command.group || ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [commands, query])

  // Clamped rather than reset in an effect: after a keystroke narrows the list
  // the cursor can point past the end for exactly one render, and clamping it
  // here fixes that render instead of scheduling a second one.
  const activeIndex = matches.length ? Math.min(cursor, matches.length - 1) : 0

  const run = (command) => {
    if (!command) return

    onClose()
    command.run()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (matches.length ? (current + 1) % matches.length : 0))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (matches.length ? (current - 1 + matches.length) % matches.length : 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      run(matches[activeIndex])
    }
  }

  return (
    <div className="admin-palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        aria-label="Admin command palette"
        aria-modal="true"
        className="admin-palette"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <input
          className="admin-palette-input"
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          placeholder="Jump to a section or run an action…"
          ref={inputRef}
          value={query}
        />
        <ul className="admin-palette-list">
          {matches.map((command, index) => (
            <li key={command.key}>
              <button
                className={
                  index === activeIndex ? 'admin-palette-item admin-palette-active' : 'admin-palette-item'
                }
                onClick={() => run(command)}
                onMouseEnter={() => setCursor(index)}
                type="button"
              >
                <span>{command.label}</span>
                {command.hint ? <small>{command.hint}</small> : null}
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li>
              <p className="admin-empty-note">Nothing matches “{query}”.</p>
            </li>
          ) : null}
        </ul>
        <p className="admin-palette-foot">↑↓ to move · Enter to run · Esc to close</p>
      </div>
    </div>
  )
}

export default AdminCommandPalette
