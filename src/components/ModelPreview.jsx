import { ContactShadows, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'

const modes = [
  { id: 'textured', label: 'Texture' },
  { id: 'studio', label: 'Studio' },
  { id: 'clay', label: 'Clay' },
  { id: 'wireframe', label: 'Wireframe' },
]

const materialKeys = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
]

const cloneTextureMaterial = (material) => {
  if (!material) return material

  const displayMaterial = new MeshBasicMaterial({
    alphaMap: material.alphaMap || null,
    color: material.color ? material.color.clone() : new Color('#ffffff'),
    map: material.map || material.emissiveMap || null,
    name: material.name,
    opacity: material.opacity ?? 1,
    side: material.side,
    transparent: material.transparent || (material.opacity ?? 1) < 1 || Boolean(material.alphaMap),
  })

  if (displayMaterial.map) {
    displayMaterial.map.colorSpace = SRGBColorSpace
  }

  return displayMaterial
}

const prepareStudioMaterial = (material) => {
  if (!material) return

  materialKeys.forEach((key) => {
    if (material[key]) material[key].needsUpdate = true
  })

  if (material.map) {
    material.map.colorSpace = SRGBColorSpace
  }

  material.envMapIntensity = material.envMapIntensity ?? 1.2
  material.needsUpdate = true
}

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
        object.userData.textureMaterial = Array.isArray(object.material)
          ? object.material.map(cloneTextureMaterial)
          : cloneTextureMaterial(object.material)
      }

      const materials = Array.isArray(object.userData.originalMaterial)
        ? object.userData.originalMaterial
        : [object.userData.originalMaterial]

      materials.filter(Boolean).forEach(prepareStudioMaterial)

      if (mode === 'clay') object.material = clayMaterial
      if (mode === 'wireframe') object.material = wireMaterial
      if (mode === 'studio') object.material = object.userData.originalMaterial
      if (mode === 'textured') object.material = object.userData.textureMaterial
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
      {mode !== 'textured' && (
        <>
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
      )}
    </>
  )
}

const ShowcaseLights = () => (
  <>
    <color attach="background" args={['#02030a']} />
    <hemisphereLight args={['#dbeafe', '#182033', 1.05]} />
    <ambientLight intensity={0.92} />
    <directionalLight
      castShadow
      color="#ffffff"
      intensity={2.85}
      position={[3.5, 4.5, 4.5]}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00025}
    />
    <directionalLight color="#dff8ff" intensity={1.8} position={[-3.5, 2.2, 2.5]} />
    <spotLight
      castShadow
      color="#fff4df"
      intensity={3.2}
      position={[0, 4.5, 3.2]}
      angle={0.48}
      penumbra={0.65}
      distance={9}
    />
    <pointLight color="#9eefff" intensity={1.55} position={[-2.8, 1.4, -2.5]} />
    <pointLight color="#ff9fe2" intensity={0.75} position={[2.8, 1.1, -2.8]} />
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
              toneMappingExposure: 1.55,
            }}
            onCreated={({ scene: canvasScene }) => {
              canvasScene.background = new Color('#02030a')
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
