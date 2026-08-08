import { useEffect, useRef } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Small, dependency-free dialog behavior shared by the project detail and the
// 3D viewer. It keeps keyboard users inside the active surface and restores
// the trigger focus when the dialog closes.
const useDialogAccessibility = ({ dialogRef, initialFocusRef, onClose, open = true }) => {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    const previousActiveElement = document.activeElement
    const dialog = dialogRef.current
    const focusInitial = () => {
      initialFocusRef.current?.focus?.()
      if (document.activeElement === previousActiveElement) {
        dialog?.querySelector(focusableSelector)?.focus?.()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll(focusableSelector))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusTimer = window.setTimeout(focusInitial, 0)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus?.()
      }
    }
  }, [dialogRef, initialFocusRef, open])
}

export default useDialogAccessibility
