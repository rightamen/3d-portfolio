import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
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
    <primitive
      object={scene}
      scale={1.4}
      rotation={[0, -0.35, 0]}
      position={[0, -0.85, 0]}
    />
  )
}

const ModelPreview = ({ project, onClose }) => {
  const [mode, setMode] = useState('textured')

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
        </div>

        <div className="model-canvas">
          <Canvas camera={{ position: [0, 0.8, 4.6], fov: 42 }} dpr={[1, 1.75]}>
            <Suspense fallback={null}>
              <ambientLight intensity={0.65} />
              <directionalLight position={[2.5, 3, 4]} intensity={1.8} />
              <ModelScene url={project.modelUrl} mode={mode} />
              <OrbitControls
                enableDamping
                makeDefault
                minDistance={1.6}
                maxDistance={8}
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
