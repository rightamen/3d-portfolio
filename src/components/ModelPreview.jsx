import { Center, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { MeshStandardMaterial } from 'three'

const modes = [
  { id: 'textured', label: 'Texture' },
  { id: 'clay', label: 'Clay' },
  { id: 'wireframe', label: 'Wireframe' },
]

const ModelScene = ({ url, mode }) => {
  const { scene } = useGLTF(url)
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
    scene.traverse((object) => {
      if (!object.isMesh) return

      if (!object.userData.originalMaterial) {
        object.userData.originalMaterial = object.material
      }

      if (mode === 'clay') object.material = clayMaterial
      if (mode === 'wireframe') object.material = wireMaterial
      if (mode === 'textured') object.material = object.userData.originalMaterial
    })
  }, [clayMaterial, mode, scene, wireMaterial])

  return (
    <Center>
      <primitive object={scene} scale={1.4} rotation={[0, -0.35, 0]} />
    </Center>
  )
}

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
          <Canvas camera={{ position: [0, 0.8, 4.6], fov: 42 }} dpr={[1, 1.75]}>
            <Suspense fallback={<CanvasLoader />}>
              <ambientLight intensity={0.65} />
              <directionalLight position={[2.5, 3, 4]} intensity={1.8} />
              <ModelScene url={project.modelUrl} mode={mode} />
              <Grid
                args={[8, 8]}
                cellColor="#2f4254"
                sectionColor="#6ad8e6"
                fadeDistance={8}
                fadeStrength={1.6}
                position={[0, -1.15, 0]}
              />
              <OrbitControls
                ref={controlsRef}
                enableDamping
                makeDefault
                minDistance={1.6}
                maxDistance={8}
                autoRotate={autoRotate}
                autoRotateSpeed={0.85}
                target={[0, -0.15, 0]}
              />
            </Suspense>
          </Canvas>
        </div>
      </div>
    </div>
  )
}

export default ModelPreview
