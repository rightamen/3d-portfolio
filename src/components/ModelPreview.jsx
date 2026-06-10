import { ContactShadows, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { inferAssetCategory } from '../lib/assetCategories'
import { pickLocalized } from '../lib/i18n'

const modes = [
  { id: 'textured', labelKey: 'modeTextured' },
  { id: 'studio', labelKey: 'modeStudio' },
  { id: 'clay', labelKey: 'modeClay' },
  { id: 'wireframe', labelKey: 'modeWireframe' },
]

const environmentUrl = '/assets/environments/studio-tomoco.exr'

const viewerProfiles = {
  generic: {
    ambient: 0.78,
    background: '#02030a',
    defaultMode: 'studio',
    envIntensity: 0.9,
    exposure: 1.1,
    fill: 1.15,
    grid: true,
    key: 2.15,
    rim: 0.42,
    spot: 1.8,
    useEnvironment: true,
  },
  'hand-painted-character': {
    ambient: 1.05,
    background: '#02030a',
    defaultMode: 'textured',
    envIntensity: 0.35,
    exposure: 1,
    fill: 0.65,
    grid: false,
    key: 0.7,
    rim: 0.15,
    spot: 0.4,
    useEnvironment: false,
  },
  'hand-painted-scene': {
    ambient: 0.9,
    background: '#02030a',
    defaultMode: 'textured',
    envIntensity: 0.42,
    exposure: 1,
    fill: 0.78,
    grid: false,
    key: 0.85,
    rim: 0.2,
    spot: 0.55,
    useEnvironment: false,
  },
  'next-gen-prop': {
    ambient: 0.42,
    background: '#05070f',
    defaultMode: 'studio',
    envIntensity: 0.72,
    exposure: 0.92,
    fill: 0.7,
    grid: true,
    key: 1.45,
    rim: 0.28,
    spot: 1.15,
    useEnvironment: true,
  },
  'next-gen-character': {
    ambient: 0.55,
    background: '#05070f',
    defaultMode: 'studio',
    envIntensity: 0.62,
    exposure: 1,
    fill: 0.85,
    grid: true,
    key: 1.55,
    rim: 0.32,
    spot: 1.25,
    useEnvironment: true,
  },
  'next-gen-scene': {
    ambient: 0.5,
    background: '#05070f',
    defaultMode: 'studio',
    envIntensity: 0.78,
    exposure: 0.88,
    fill: 0.8,
    grid: false,
    key: 1.25,
    rim: 0.24,
    spot: 0.95,
    useEnvironment: true,
  },
}

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

const blendMaterialNamePattern = /(glass|clear|transparent|translucent|blend|water|visor|acrylic)/i

const getTransparencyMode = (material) => {
  if (!material) return 'opaque'

  const hasAlphaMap = Boolean(material.alphaMap)
  const hasPartialOpacity = (material.opacity ?? 1) < 0.999
  const wantsBlendedTransparency =
    hasPartialOpacity || (!hasAlphaMap && material.transparent) || blendMaterialNamePattern.test(material.name || '')

  if (wantsBlendedTransparency) return 'blend'
  if (hasAlphaMap || material.transparent) return 'cutout'
  return 'opaque'
}

const materialUsesTransparency = (material) => getTransparencyMode(material) !== 'opaque'

const configureTransparentMaterial = (material) => {
  if (!material) return material

  const transparencyMode = getTransparencyMode(material)
  material.side = DoubleSide

  if ('forceSinglePass' in material) {
    material.forceSinglePass = false
  }

  if (transparencyMode === 'opaque') {
    material.needsUpdate = true
    return material
  }

  material.depthTest = true

  if (transparencyMode === 'cutout') {
    material.transparent = false
    material.depthWrite = true
    material.alphaTest = Math.max(material.alphaTest || 0, 0.45)
  } else {
    material.transparent = true
    material.depthWrite = false
    material.alphaTest = Math.max(material.alphaTest || 0, material.alphaMap ? 0.01 : 0)
  }

  material.needsUpdate = true

  return material
}

const cloneTextureMaterial = (material) => {
  if (!material) return material

  const displayMaterial = new MeshBasicMaterial({
    alphaMap: material.alphaMap || null,
    alphaTest: material.alphaTest || 0,
    blending: material.blending,
    color: material.color ? material.color.clone() : new Color('#ffffff'),
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    map: material.map || material.emissiveMap || null,
    name: material.name,
    opacity: material.opacity ?? 1,
    premultipliedAlpha: material.premultipliedAlpha,
    side: DoubleSide,
    transparent: getTransparencyMode(material) === 'blend',
  })

  if (displayMaterial.map) {
    displayMaterial.map.colorSpace = SRGBColorSpace
  }

  return configureTransparentMaterial(displayMaterial)
}

const prepareStudioMaterial = (material, profile) => {
  if (!material) return

  materialKeys.forEach((key) => {
    if (material[key]) material[key].needsUpdate = true
  })

  if (material.map) {
    material.map.colorSpace = SRGBColorSpace
  }

  configureTransparentMaterial(material)

  material.envMapIntensity = profile.envIntensity
  if (typeof material.metalness === 'number') material.metalness = Math.min(material.metalness, 0.95)
  if (typeof material.roughness === 'number') material.roughness = Math.max(material.roughness, 0.38)
  material.needsUpdate = true
}

const ModelScene = ({ url, mode, profile }) => {
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
    () => new MeshStandardMaterial({ color: '#b8bdc7', roughness: 0.72, side: DoubleSide }),
    [],
  )
  const wireMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#71f7ff',
        roughness: 0.6,
        side: DoubleSide,
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

      materials.filter(Boolean).forEach((material) => prepareStudioMaterial(material, profile))

      object.renderOrder = materials.some(materialUsesTransparency) ? 10 : 0

      if (mode === 'clay') object.material = clayMaterial
      if (mode === 'wireframe') object.material = wireMaterial
      if (mode === 'studio') object.material = object.userData.originalMaterial
      if (mode === 'textured') object.material = object.userData.textureMaterial
    })
  }, [clayMaterial, displayScene, mode, profile, wireMaterial])

  return (
    <>
      <primitive
        object={displayScene}
        position={transform.position}
        scale={transform.scale}
        rotation={[0, -0.35, 0]}
      />
      {mode !== 'textured' && profile.grid && (
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
            opacity={profile.envIntensity * 0.34}
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

const StudioEnvironment = () => {
  const { gl } = useThree()
  const [environment, setEnvironment] = useState(null)

  useEffect(() => {
    let disposed = false
    let generatedEnvironment = null
    const generator = new PMREMGenerator(gl)
    generator.compileEquirectangularShader()

    new EXRLoader().load(
      environmentUrl,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }

        generatedEnvironment = generator.fromEquirectangular(texture).texture
        setEnvironment(generatedEnvironment)
        texture.dispose()
        generator.dispose()
      },
      undefined,
      () => {
        generator.dispose()
      },
    )

    return () => {
      disposed = true
      generatedEnvironment?.dispose()
      generator.dispose()
    }
  }, [gl])

  if (!environment) return null

  return <primitive attach="environment" object={environment} />
}

const ShowcaseLights = ({ profile }) => (
  <>
    <color attach="background" args={[profile.background]} />
    <hemisphereLight args={['#dbeafe', '#182033', profile.ambient * 0.9]} />
    <ambientLight intensity={profile.ambient} />
    <directionalLight
      castShadow
      color="#ffffff"
      intensity={profile.key}
      position={[3.5, 4.5, 4.5]}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00025}
    />
    <directionalLight color="#dff8ff" intensity={profile.fill} position={[-3.5, 2.2, 2.5]} />
    <spotLight
      castShadow
      color="#fff4df"
      intensity={profile.spot}
      position={[0, 4.5, 3.2]}
      angle={0.48}
      penumbra={0.65}
      distance={9}
    />
    <pointLight color="#9eefff" intensity={profile.rim} position={[-2.8, 1.4, -2.5]} />
    <pointLight color="#ff9fe2" intensity={profile.rim * 0.45} position={[2.8, 1.1, -2.8]} />
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

const ModelPreview = ({ project, onClose, language = 'zh', copy }) => {
  const assetCategory = useMemo(() => inferAssetCategory(project), [project])
  const profile = viewerProfiles[assetCategory] || viewerProfiles.generic
  const [mode, setMode] = useState(profile.defaultMode)
  const [autoRotate, setAutoRotate] = useState(false)
  const controlsRef = useRef(null)

  useEffect(() => {
    setMode(profile.defaultMode)
  }, [profile.defaultMode, project.slug])

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
            <div className="section-kicker mb-1">{copy.modelPreview}</div>
            <h3 className="text-xl font-semibold text-white">
              {pickLocalized(project, 'title', language)}
            </h3>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            {copy.close}
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
              {copy[item.labelKey]}
            </button>
          ))}
          <button type="button" className="mode-button" onClick={resetView}>
            {copy.reset}
          </button>
          <button
            type="button"
            className={autoRotate ? 'mode-button-active' : 'mode-button'}
            onClick={() => setAutoRotate((current) => !current)}
          >
            {copy.autoRotate}
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
              toneMappingExposure: profile.exposure,
            }}
            onCreated={({ gl, scene: canvasScene }) => {
              gl.sortObjects = true
              canvasScene.background = new Color(profile.background)
            }}
          >
            <Suspense fallback={<CanvasLoader />}>
              {profile.useEnvironment && mode !== 'textured' && <StudioEnvironment />}
              <ShowcaseLights profile={profile} />
              <ModelScene url={project.modelUrl} mode={mode} profile={profile} />
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
