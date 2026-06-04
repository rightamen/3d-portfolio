import { ContactShadows, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, Box3, Color, MeshStandardMaterial, Vector3 } from 'three'

const modes = [
  { id: 'textured', label: 'Texture' },
  { id: 'clay', label: 'Clay' },
  { id: 'wireframe', label: 'Wireframe' },
]

const ModelScene = ({ url, mode }) => {
  const { scene } = useGLTF(url)
  const displayScene = useMemo(() => {
    const clonedScene = scene.clone(true)

    clonedScene.traverse((object) => {
      if (!object.isMesh) return

      object.castShadow = true
      object.receiveShadow = true

      if (Array.isArray(object.material)) {
        object.material = object.material.map((material) => material.clone())
      } else if (object.material) {
        object.material = object.material.clone()
      }
    })

    return clonedScene
  }, [scene])
  const transform = useMemo(() => {
    const box = new Box3().setFromObject(displayScene)
    const size = new Vector3()
    const center = new Vector3()

    box.getSize(size)
    box.getCenter(center)

    const maxDimension = Math.max(size.x, size.y, size.z) || 1
    const scale = 2.35 / maxDimension
    const bottom = (box.min.y - center.y) * scale

    return {
      position: [-center.x * scale, -center.y * scale, -center.z * scale],
      scale,
      gridY: bottom,
    }
  }, [displayScene])
  const clayMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#b8bdc7', roughness: 0.72 }),
    [],
  )
  const wireMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#71f7ff',
        roughness: 0.6,
        wireframe: true,
      }),
    [],
  )

  useEffect(() => {
    displayScene.traverse((object) => {
      if (!object.isMesh) return

      if (!object.userData.originalMaterial) {
        object.userData.originalMaterial = object.material
      }

      const materials = Array.isArray(object.userData.originalMaterial)
        ? object.userData.originalMaterial
        : [object.userData.originalMaterial]

      materials.filter(Boolean).forEach((material) => {
        material.envMapIntensity = material.envMapIntensity ?? 1.2
        material.needsUpdate = true
      })

      if (mode === 'clay') object.material = clayMaterial
      if (mode === 'wireframe') object.material = wireMaterial
      if (mode === 'textured') object.material = object.userData.originalMaterial
    })
  }, [clayMaterial, displayScene, mode, wireMaterial])

  return (
    <>
      <primitive
        object={displayScene}
        position={transform.position}
        scale={transform.scale}
        rotation={[0, -0.35, 0]}
      />
      <Grid
        args={[8, 8]}
        cellColor="#35495c"
        sectionColor="#62d8e8"
        fadeDistance={8}
        fadeStrength={1.35}
        position={[0, transform.gridY, 0]}
      />
      <ContactShadows
        position={[0, transform.gridY + 0.02, 0]}
        opacity={0.42}
        scale={6}
        blur={2.4}
        far={3.5}
        color="#020617"
      />
    </>
  )
}

const ShowcaseLights = () => (
  <>
    <color attach="background" args={['#080c18']} />
    <hemisphereLight args={['#dbeafe', '#182033', 1.05]} />
    <ambientLight intensity={0.38} />
    <directionalLight
      castShadow
      color="#ffffff"
      intensity={2.4}
      position={[3.5, 4.5, 4.5]}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00025}
    />
    <directionalLight color="#78f4ff" intensity={1.15} position={[-3.5, 2.2, 2.5]} />
    <spotLight
      castShadow
      color="#fff4df"
      intensity={2.3}
      position={[0, 4.5, 3.2]}
      angle={0.48}
      penumbra={0.65}
      distance={9}
    />
    <pointLight color="#38d6ff" intensity={1.2} position={[-2.8, 1.4, -2.5]} />
    <pointLight color="#ff7ad9" intensity={0.55} position={[2.8, 1.1, -2.8]} />
  </>
)

const CanvasLoader = () => {
  const { progress } = useProgress()

  return (
    <Html center className="model-loader">
      {Math.round(progress)}%
    </Html>
  )
}

const ModelPreview = ({ project, onClose }) => {
  const [mode, setMode] = useState('textured')
  const [autoRotate, setAutoRotate] = useState(false)
  const controlsRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const resetView = () => {
    controlsRef.current?.reset()
  }

  return (
    <div className="model-overlay" role="dialog" aria-modal="true">
      <div className="model-panel">
        <div className="model-toolbar">
          <div>
            <div className="section-kicker mb-1">3D Preview</div>
            <h3 className="text-xl font-semibold text-white">{project.title}</h3>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="model-controls">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? 'mode-button-active' : 'mode-button'}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="mode-button" onClick={resetView}>
            Reset
          </button>
          <button
            type="button"
            className={autoRotate ? 'mode-button-active' : 'mode-button'}
            onClick={() => setAutoRotate((current) => !current)}
          >
            Auto Rotate
          </button>
        </div>

        <div className="model-canvas">
          <Canvas
            camera={{ position: [0, 0.55, 4.8], fov: 42 }}
            dpr={[1, 1.75]}
            shadows
            gl={{
              antialias: true,
              outputColorSpace: 'srgb',
              toneMapping: ACESFilmicToneMapping,
              toneMappingExposure: 1.28,
            }}
            onCreated={({ scene: canvasScene }) => {
              canvasScene.background = new Color('#080c18')
            }}
          >
            <Suspense fallback={<CanvasLoader />}>
              <ShowcaseLights />
              <ModelScene url={project.modelUrl} mode={mode} />
              <OrbitControls
                ref={controlsRef}
                enableDamping
                makeDefault
                minDistance={1.2}
                maxDistance={9}
                autoRotate={autoRotate}
                autoRotateSpeed={0.85}
                target={[0, 0, 0]}
              />
            </Suspense>
          </Canvas>
        </div>
      </div>
    </div>
  )
}

export default ModelPreview
