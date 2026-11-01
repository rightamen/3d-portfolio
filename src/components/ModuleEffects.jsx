import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useModuleEffects } from '../hooks/useModuleEffects'

const ModuleEffects = ({ children }) => {
  const { pathname } = useLocation()
  const rootRef = useRef(null)
  const kind = pathname.startsWith('/u/') ? 'profile'
    : pathname.startsWith('/explore') ? 'explore'
      : pathname.startsWith('/w/') ? 'work'
        : pathname.startsWith('/community') ? 'community'
          : pathname.startsWith('/account') ? 'account'
            : pathname.startsWith('/login') ? 'auth' : 'home'
  useModuleEffects(rootRef, kind, pathname)
  return <div className="module-motion-surface" data-module-kind={kind} ref={rootRef}>{children}</div>
}
export default ModuleEffects
