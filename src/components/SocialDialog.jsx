import { useId,useRef } from 'react'
import { createPortal } from 'react-dom'
import useDialogAccessibility from '../hooks/useDialogAccessibility'
const SocialDialog=({title,copy,onClose,children})=>{
 const ref=useRef(null),close=useRef(null),id=useId()
 useDialogAccessibility({dialogRef:ref,initialFocusRef:close,onClose})
 return createPortal(<div className="social-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="social-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}><header><h2 id={id}>{title}</h2><button type="button" ref={close} onClick={onClose} aria-label={copy.socialClose}>×</button></header>{children}</section></div>,document.body)
}
export default SocialDialog
