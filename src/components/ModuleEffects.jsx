import { useLocation } from 'react-router-dom'
import PageEffects from './PageEffects'

const ModuleEffects = ({ children }) => {
  const { pathname } = useLocation()
  const kind = pathname.startsWith('/u/') ? 'profile'
    : pathname.startsWith('/creators') ? 'creators'
    : pathname.startsWith('/settings') ? 'settings'
    : pathname.startsWith('/explore') ? 'explore'
      : pathname.startsWith('/w/') ? 'work'
        : pathname.startsWith('/community') ? 'community'
          : pathname.startsWith('/account') ? 'account'
            : pathname.startsWith('/login') ? 'auth' : 'home'
  return <PageEffects kind={kind} identity={pathname}>{children}</PageEffects>
}
export default ModuleEffects
