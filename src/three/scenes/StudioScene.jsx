import { useInterfaceMotion } from '../../hooks/useInterfacePreferences'
import { Suspense, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Image, Lightformer, OrbitControls, RoundedBox, useCursor } from '@react-three/drei'
import { MathUtils } from 'three'
import ModelErrorBoundary from '../../components/ModelErrorBoundary'
const lightingPresets = {
  silver: { frame: '#acb1c1', inactive: '#52586b', rim: '#d6d2ff', left: '#adbfe1', right: '#b1abd5', softbox: '#c9d8ff', fill: '#d4cdff', stage: '#171b26', ring: '#646b89' },
  amber: { frame: '#c9b79a', inactive: '#736354', rim: '#ffe2b8', left: '#ffdfb5', right: '#d4a77e', softbox: '#fff1d4', fill: '#edc29c', stage: '#211c19', ring: '#9d8261' },
}
const ArtPanel = ({ work, at, selectedIndex, onSelect, totalCount, palette }) => {
  const group = useRef(null)
  const [hovered, setHovered] = useState(false)
  const reducedMotion=useInterfaceMotion()!=='full'
  useCursor(hovered)
  let offset = at - selectedIndex
  if (offset > totalCount / 2) offset -= totalCount
  if (offset < -totalCount / 2) offset += totalCount
  const selected = offset === 0
  const angle = offset * 0.72
  const x = Math.sin(angle) * 3.8
  const z = (Math.cos(angle) - 1) * 3.8 + (selected ? 0.22 : 0)
  const y = (selected ? 0.08 : -0.08) + (hovered && !reducedMotion ? 0.10 : 0)
  const size = selected ? 1.06 : hovered && !reducedMotion ? 1.01 : 0.94
  const [initialPosition] = useState(() => [x,y,z])
  const [initialRotation] = useState(() => [0,-angle,0])
  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    const tilt = hovered && !reducedMotion ? -0.025 : 0
    const moving = Math.abs(node.position.x-x)+Math.abs(node.position.y-y)+Math.abs(node.position.z-z)+Math.abs(node.rotation.y+angle)+Math.abs(node.scale.x-size)+Math.abs(node.rotation.x-tilt)>0.001
    const damp = (from,to) => reducedMotion ? to : MathUtils.damp(from,to,8,Math.min(delta,0.08))
    node.position.set(damp(node.position.x,x),damp(node.position.y,y),damp(node.position.z,z))
    node.rotation.y=damp(node.rotation.y,-angle)
    node.rotation.x=damp(node.rotation.x,tilt)
    node.scale.setScalar(damp(node.scale.x,size))
    if (moving) state.invalidate()
  })
  return (
    <group ref={group} position={initialPosition} rotation={initialRotation}
      onPointerOver={(event)=>{event.stopPropagation();setHovered(true)}}
      onPointerOut={()=>setHovered(false)}
      onClick={(event)=>{event.stopPropagation();if(event.delta<5)onSelect(work.id)}}>
      <RoundedBox args={[2.54,2.08,0.15]} radius={0.055} smoothness={4} position={[0,0,-0.08]} castShadow>
        <meshPhysicalMaterial color={selected ? palette.frame : palette.inactive} roughness={0.23} metalness={0.86} clearcoat={0.5} />
      </RoundedBox>
      <RoundedBox args={[2.45,1.99,0.025]} radius={0.035} smoothness={4} position={[0,0,0.004]}><meshBasicMaterial color="#0b0e17" /></RoundedBox>
      {(work.thumbnail || work.image) && <ModelErrorBoundary resetKey={work.thumbnail || work.image} fallback={null}><Suspense fallback={null}><Image url={work.thumbnail || work.image} position={[0,0,0.022]} scale={[2.34,1.88]} color={selected || hovered ? '#ffffff' : '#b0b6c4'} transparent toneMapped={false} /></Suspense></ModelErrorBoundary>}
      {selected && <mesh position={[0,-1.076,0]}><boxGeometry args={[0.28,0.018,0.018]} /><meshBasicMaterial color={palette.rim} /></mesh>}
    </group>
  )
}
const StudioScene = ({ works, selectedIndex, onSelect, label, lighting = 'silver' }) => {
  const palette = lightingPresets[lighting] || lightingPresets.silver
  return (
  <div className="studio-scene spatial-canvas" role="img" aria-label={label}>
    <Canvas shadows camera={{position:[0,0.65,4.7],fov:35}} dpr={[1,1.5]} frameloop="demand">
      <ambientLight intensity={0.5} />
      <spotLight position={[0,5,3]} intensity={55} angle={0.65} penumbra={1} castShadow shadow-mapSize={[1024,1024]} shadow-bias={-0.0001} />
      <directionalLight position={[-4,2,3]} intensity={1.3} color={palette.left} />
      <directionalLight position={[4,1,-2]} intensity={2} color={palette.right} />
      <Environment key={lighting} resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0,4,0]} scale={[8,2,1]} rotation={[Math.PI/2,0,0]} />
        <Lightformer form="rect" intensity={3} color={palette.softbox} position={[-5,0,2]} scale={[2,5,1]} rotation={[0,Math.PI/2,0]} />
        <Lightformer form="rect" intensity={2} color={palette.fill} position={[5,1,-2]} scale={[2,5,1]} rotation={[0,-Math.PI/2,0]} />
      </Environment>
      {works.map((work,at)=><ArtPanel key={work.id} work={work} at={at} selectedIndex={selectedIndex} onSelect={onSelect} totalCount={works.length} palette={palette} />)}
      <mesh position={[0,-1.38,-1.2]} receiveShadow><cylinderGeometry args={[5,5.08,0.16,96]} /><meshStandardMaterial color={palette.stage} metalness={0.65} roughness={0.37} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.294,-1.2]}><ringGeometry args={[4.82,4.835,128]} /><meshBasicMaterial color={palette.ring} transparent opacity={0.45} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.47,0]} receiveShadow><planeGeometry args={[80,80]} /><meshStandardMaterial color="#090c13" metalness={0.45} roughness={0.4} /></mesh>
      <OrbitControls makeDefault enablePan={false} enableZoom minDistance={3.5} maxDistance={11} minPolarAngle={0.4} maxPolarAngle={1.7} target={[0,-0.08,-0.5]} />
    </Canvas>
  </div>
  )
}
export default StudioScene
