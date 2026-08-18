// Motion primitives for the console.
//
// The animation itself lives in CSS -- index.css already neutralises every
// keyframe and transition under `prefers-reduced-motion: reduce`, so anything
// declarative is honoured for free. What cannot be honoured for free is motion
// driven by JavaScript, which is why the hook below exists: the counters and
// the 3D scene ask before they move.

import { useEffect, useRef, useState } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

// One subscription helper for both of the media questions this console asks:
// may it move, and is there room. Both have to be live rather than read once
// -- a laptop that gets an external monitor, or a system setting flipped mid
// session, changes the answer without a reload.
export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false

    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const media = window.matchMedia(query)
    const onChange = (event) => setMatches(event.matches)

    media.addEventListener('change', onChange)

    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export const usePrefersReducedMotion = () => useMediaQuery(reducedMotionQuery)

// True while the tab is in the foreground. The 3D scene reads this so a
// backgrounded console stops asking for animation frames -- an admin page left
// open in a tab all day should cost nothing while nobody is looking at it.
export const useDocumentVisible = () => {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  )

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const onChange = () => setVisible(!document.hidden)

    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

// Counts from the previous value to the next one on a cubic ease-out.
//
// It animates on *change*, not only on mount: switching the dashboard window
// from 30 to 90 days is the moment the number carries information, and a tile
// that snaps loses the fact that it went up. Reduced motion returns the target
// immediately -- the value is the point, the travel is decoration.
export const useCountUp = (value, { duration = 900, enabled = true } = {}) => {
  const target = Number(value) || 0
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const frameRef = useRef(0)

  useEffect(() => {
    // Nothing is set synchronously here: with motion off the hook returns the
    // target directly, and the ref is kept in step so re-enabling counts from
    // where the display actually is rather than from zero.
    if (!enabled) {
      fromRef.current = target
      return undefined
    }

    const from = fromRef.current
    if (from === target) return undefined

    const started = performance.now()
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - (1 - progress) ** 3
      const next = from + (target - from) * eased

      setDisplay(progress === 1 ? target : Math.round(next))
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
      else fromRef.current = target
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [duration, enabled, target])

  return enabled ? display : target
}

// Rows enter in sequence rather than all at once. The index is handed to CSS as
// a custom property instead of an inline delay so the stagger step can be tuned
// in one place, and so `prefers-reduced-motion` can flatten it.
export const stagger = (index, cap = 14) => ({ '--stagger-index': Math.min(index, cap) })
