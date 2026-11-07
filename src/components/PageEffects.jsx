import { useRef } from 'react'
import { useModuleEffects } from '../hooks/useModuleEffects'
const PageEffects=({children,kind,identity})=>{
 const root=useRef(null);useModuleEffects(root,kind,identity)
 return <div className="module-motion-surface" data-module-kind={kind} ref={root}>{children}</div>
}
export default PageEffects
