import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, MathUtils, Vector3 } from 'three'

// The console's one three-dimensional object, and the only place on this page
// where the shape of the work is visible before any number is read.
//
// It is a map, not an ornament: each sphere is a section, its radius is how
// much happened there in the current window, and its colour is whether anyone
// is waiting on it. A section with a queue glows coral and pushes its label
// out permanently; a quiet one stays aqua and unlabelled until hovered. That
// makes "where is the work" a glance rather than a scroll through eleven
// panels.
//
// Loaded lazily by AdminGalaxy, which also owns the flat fallback -- nothing
// here is on the critical path to moderating a comment, so none of three.js
// should be either.

const ACCENT_IDLE = '#33c2cc'
const ACCENT_BUSY = '#f4708f'
const ACCENT_CORE = '#7ef7e6'

// A seeded generator rather than Math.random: the starfield is built once, at
// module load, so it is identical on every render and every mount. Random
// values produced during render are unstable by definition -- React may render
// twice and get two different skies -- and the lint rule that says so is
// right.
const mulberry32 = (seed) => () => {
  let value = (seed += 0x6d2b79f5)
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

const buildStarPositions = (count) => {
  const random = mulberry32(0x5eed)
  const positions = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    // Shell sampling: a direction on the unit sphere pushed out to a random
    // radius, so the field has depth instead of sitting on one surface behind
    // the scene.
    const theta = random() * Math.PI * 2
    const phi = Math.acos(2 * random() - 1)
    const radius = 14 + random() * 22

    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[index * 3 + 1] = radius * Math.cos(phi) * 0.55
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }

  return positions
}

const STAR_POSITIONS = buildStarPositions(480)

// Scratch vectors for the per-frame occlusion test. Allocating two Vector3s
// sixty times a second per node is exactly the kind of garbage that shows up
// as a stutter on a laptop on battery.
const worldPosition = new Vector3()
const screenPosition = new Vector3()

const orbitFor = (index, count) => {
  // Three shells rather than one ring: eleven spheres on a single orbit
  // overlap into a bracelet from every camera angle worth having.
  const shell = index % 3
  const radius = 2.7 + shell * 1.35
  const tilt = (shell - 1) * 0.45
  const angle = (index / count) * Math.PI * 2 + shell * 0.7

  return { angle, radius, tilt }
}

const Starfield = ({ count = 420 }) => {
  const geometry = useMemo(() => {
    const used = Math.min(count, STAR_POSITIONS.length / 3)
    const buffer = new BufferGeometry()
    buffer.setAttribute('position', new BufferAttribute(STAR_POSITIONS.slice(0, used * 3), 3))

    return buffer
  }, [count])

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#8fd8ff"
        depthWrite={false}
        opacity={0.55}
        size={0.075}
        sizeAttenuation
        transparent
      />
    </points>
  )
}

const Core = ({ spin }) => {
  const group = useRef(null)

  useFrame((state, delta) => {
    if (!group.current || !spin) return

    group.current.rotation.y += delta * 0.18
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.12
  })

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial
          color="#0b2b33"
          emissive={ACCENT_CORE}
          emissiveIntensity={0.32}
          flatShading
          metalness={0.35}
          roughness={0.42}
        />
      </mesh>
      <mesh scale={1.32}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color={ACCENT_CORE} opacity={0.16} transparent wireframe />
      </mesh>
    </group>
  )
}

const OrbitRing = ({ radius, tilt }) => (
  <mesh rotation={[Math.PI / 2 + tilt, 0, 0]}>
    <torusGeometry args={[radius, 0.006, 6, 128]} />
    <meshBasicMaterial color={ACCENT_IDLE} opacity={0.18} transparent />
  </mesh>
)

const SectionNode = ({ compact, index, node, onSelect, spin, total }) => {
  const group = useRef(null)
  const body = useRef(null)
  const [hovered, setHovered] = useState(false)
  // Html is DOM: it paints over the scene no matter what is in front of it, so
  // a node on the far side of the core kept its label floating on the core's
  // face. This hides the label while the node is both behind the core and
  // within its silhouette.
  const [occluded, setOccluded] = useState(false)
  const occludedRef = useRef(false)

  const { angle, radius, tilt } = useMemo(() => orbitFor(index, total), [index, total])

  // Size carries volume, so it needs a floor: a section with nothing in it is
  // still a place you can click, and a zero-radius sphere is a hole.
  const size = 0.16 + Math.min(1, (node.value || 0) / Math.max(1, node.scale || 1)) * 0.22
  const busy = Boolean(node.pending)

  useFrame((state, delta) => {
    if (!group.current || !body.current) return

    if (spin) group.current.rotation.y += delta * (0.06 + (index % 3) * 0.015)

    body.current.getWorldPosition(worldPosition)
    screenPosition.copy(worldPosition).project(state.camera)
    const behindCore =
      worldPosition.distanceTo(state.camera.position) > state.camera.position.length()
    const insideSilhouette = Math.hypot(screenPosition.x, screenPosition.y) < 0.17
    const nextOccluded = behindCore && insideSilhouette

    // setState only on the flip, never once a frame.
    if (nextOccluded !== occludedRef.current) {
      occludedRef.current = nextOccluded
      setOccluded(nextOccluded)
    }

    const target = hovered ? 1.55 : 1
    body.current.scale.setScalar(
      MathUtils.lerp(body.current.scale.x, target, Math.min(1, delta * 8)),
    )

    if (busy && spin) {
      // A slow breath, not a blink: the queue is a state to notice, not an
      // alarm to dismiss.
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6 + index) * 0.06
      body.current.children[1].scale.setScalar(pulse)
    }
  })

  return (
    <group ref={group} rotation={[tilt, 0, 0]}>
      <group position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
        <group
          onClick={(event) => {
            event.stopPropagation()
            onSelect(node)
          }}
          onPointerOut={() => {
            setHovered(false)
            document.body.style.cursor = ''
          }}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHovered(true)
            document.body.style.cursor = 'pointer'
          }}
          ref={body}
        >
          <mesh>
            <sphereGeometry args={[size, 24, 24]} />
            <meshStandardMaterial
              color={busy ? ACCENT_BUSY : ACCENT_IDLE}
              emissive={busy ? ACCENT_BUSY : ACCENT_IDLE}
              emissiveIntensity={busy ? 0.85 : 0.45}
              metalness={0.2}
              roughness={0.35}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[size * 1.9, 16, 16]} />
            <meshBasicMaterial
              blending={AdditiveBlending}
              color={busy ? ACCENT_BUSY : ACCENT_IDLE}
              depthWrite={false}
              opacity={busy ? 0.22 : 0.1}
              transparent
            />
          </mesh>
        </group>

        {/* Labels are DOM, not extruded text: three languages including two
            CJK scripts would mean shipping a font atlas per language, and a
            div reads at any camera distance without one. */}
        {(hovered || (busy && !compact)) && !occluded ? (
          <Html center className="admin-galaxy-label-anchor" zIndexRange={[8, 0]}>
            <button
              // Alternating sides: two spheres that happen to line up in the
              // projection would otherwise stack their labels on the same spot.
              className={[
                'admin-galaxy-label',
                busy ? 'admin-galaxy-label-busy' : '',
                index % 2 ? 'admin-galaxy-label-below' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(node)}
              type="button"
            >
              <strong>{node.label}</strong>
              <small>{busy ? node.pendingLabel : node.valueLabel}</small>
            </button>
          </Html>
        ) : null}
      </group>
    </group>
  )
}

// The camera leans towards the pointer instead of the scene turning under it:
// the orbit controls already own rotation, and two things answering the same
// gesture reads as drift rather than depth.
const PointerLean = ({ enabled }) => {
  // The camera comes off the frame state rather than out of useThree(): it is
  // the same object either way, but one of them is a value React handed us and
  // must not be mutated.
  useFrame(({ camera, pointer }, delta) => {
    if (!enabled) return

    const amount = Math.min(1, delta * 2)
    camera.position.y = MathUtils.lerp(camera.position.y, 2.4 + pointer.y * 0.9, amount)
    camera.lookAt(0, 0, 0)
  })

  return null
}

const AdminGalaxyScene = ({ compact = false, nodes = [], onSelect, running = true, spin = true }) => {
  const scale = Math.max(1, ...nodes.map((node) => node.value || 0))

  return (
    <Canvas
      camera={{ fov: compact ? 56 : 46, position: [0, 2.4, compact ? 10.5 : 10.6] }}
      dpr={[1, compact ? 1.4 : 1.7]}
      frameloop={running ? 'always' : 'demand'}
      gl={{ alpha: true, antialias: !compact, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.75} />
      <pointLight color="#5ce1e6" intensity={38} position={[4, 5, 4]} />
      <pointLight color="#c86bff" intensity={22} position={[-6, -3, -4]} />

      <Starfield count={compact ? 220 : 420} />
      <Core spin={spin} />

      {[0, 1, 2].map((shell) => (
        <OrbitRing key={shell} radius={2.7 + shell * 1.35} tilt={(shell - 1) * 0.45} />
      ))}

      {nodes.map((node, index) => (
        <SectionNode
          compact={compact}
          index={index}
          key={node.key}
          node={{ ...node, scale }}
          onSelect={onSelect}
          spin={spin}
          total={nodes.length}
        />
      ))}

      <PointerLean enabled={spin} />
      <OrbitControls
        autoRotate={spin}
        autoRotateSpeed={0.55}
        enableDamping
        enablePan={false}
        enableZoom={false}
        maxPolarAngle={Math.PI / 1.75}
        minPolarAngle={Math.PI / 3.4}
      />
    </Canvas>
  )
}

export default AdminGalaxyScene
