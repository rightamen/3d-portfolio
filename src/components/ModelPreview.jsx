import { ContactShadows, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { inferAssetCategory } from '../lib/assetCategories'
import { pickLocalized, translateKnownLabel } from '../lib/i18n'

const modes = [
  { id: 'textured', labelKey: 'modeTextured' },
  { id: 'studio', labelKey: 'modeStudio' },
  { id: 'clay', labelKey: 'modeClay' },
  { id: 'wireframe', labelKey: 'modeWireframe' },
]

const environmentUrl = '/assets/environments/studio-tomoco.exr'

const alphaModes = [
  { id: 'auto', labelKey: 'alphaAuto' },
  { id: 'opaque', labelKey: 'alphaOpaque' },
  { id: 'cutout', labelKey: 'alphaCutout' },
  { id: 'blend', labelKey: 'alphaBlend' },
]

const sceneModes = [
  { id: 'studio', labelKey: 'viewerSceneStudio' },
  { id: 'dark', labelKey: 'viewerSceneDark' },
  { id: 'grid', labelKey: 'viewerSceneGrid' },
]

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

const defaultRenderSettings = {
  alphaMode: 'auto',
  doubleSided: true,
}

const emptyModelStats = {
  bounds: null,
  materials: 0,
  textures: 0,
  triangles: 0,
  vertices: 0,
}

const formatNumber = (value, fallback = 'Unknown') =>
  Number.isFinite(value) && value > 0 ? new Intl.NumberFormat().format(Math.round(value)) : fallback

const disposeMaterial = (material) => {
  if (!material) return
  materialKeys.forEach((key) => {
    material[key]?.dispose?.()
  })
  material.dispose?.()
}

const disposeObject = (object) => {
  object.traverse((child) => {
    if (!child.isMesh) return
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach(disposeMaterial)
  })
}

const collectModelStats = (scene) => {
  const materials = new Set()
  const textures = new Set()
  let triangles = 0
  let vertices = 0

  scene.traverse((object) => {
    if (!object.isMesh) return

    const geometry = object.geometry
    const positionCount = geometry?.attributes?.position?.count || 0
    vertices += positionCount
    triangles += geometry?.index?.count ? geometry.index.count / 3 : positionCount / 3

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material.uuid || material)
      materialKeys.forEach((key) => {
        if (material[key]) textures.add(material[key].uuid || material[key])
      })
    })
  })

  return {
    materials: materials.size,
    textures: textures.size,
    triangles,
    vertices,
  }
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn('Model preview failed to load.', error?.message || error)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

const getStoredMaterialState = (material) => {
  if (!material) return null

  material.userData.previewMaterialState ||= {
    alphaTest: material.alphaTest || 0,
    opacity: material.opacity ?? 1,
    transparent: Boolean(material.transparent),
  }

  return material.userData.previewMaterialState
}

const getTransparencyMode = (material, renderSettings = defaultRenderSettings) => {
  if (!material) return 'opaque'
  if (renderSettings.alphaMode !== 'auto') return renderSettings.alphaMode

  const storedState = getStoredMaterialState(material)
  const hasAlphaTexture = Boolean(material.alphaMap || material.map)
  const hasPartialOpacity = (storedState?.opacity ?? material.opacity ?? 1) < 0.999
  const wantsBlendedTransparency =
    hasPartialOpacity || blendMaterialNamePattern.test(material.name || '')

  if (wantsBlendedTransparency) return 'blend'
  if (
    (storedState?.alphaTest ?? material.alphaTest ?? 0) > 0 ||
    material.alphaMap ||
    ((storedState?.transparent ?? material.transparent) && hasAlphaTexture)
  ) {
    return 'cutout'
  }
  return 'opaque'
}

const materialUsesTransparency = (material, renderSettings) => getTransparencyMode(material, renderSettings) !== 'opaque'

const configureTransparentMaterial = (material, renderSettings = defaultRenderSettings) => {
  if (!material) return material

  const storedState = getStoredMaterialState(material)
  const transparencyMode = getTransparencyMode(material, renderSettings)
  material.side = renderSettings.doubleSided ? DoubleSide : FrontSide

  if ('forceSinglePass' in material) {
    material.forceSinglePass = false
  }

  material.depthTest = true

  if (transparencyMode === 'opaque') {
    material.transparent = false
    material.depthWrite = true
    material.alphaTest = 0
  } else if (transparencyMode === 'cutout') {
    material.transparent = false
    material.depthWrite = true
    material.alphaTest = Math.max(storedState?.alphaTest || 0, 0.08)
  } else {
    material.transparent = true
    material.depthWrite = false
    material.alphaTest = material.alphaMap ? 0.01 : 0
  }

  material.needsUpdate = true

  return material
}

const cloneTextureMaterial = (material, renderSettings) => {
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
    side: renderSettings.doubleSided ? DoubleSide : FrontSide,
    transparent: getTransparencyMode(material, renderSettings) === 'blend',
  })

  if (displayMaterial.map) {
    displayMaterial.map.colorSpace = SRGBColorSpace
  }

  return configureTransparentMaterial(displayMaterial, renderSettings)
}

const prepareStudioMaterial = (material, profile, renderSettings) => {
  if (!material) return

  materialKeys.forEach((key) => {
    if (material[key]) material[key].needsUpdate = true
  })

  if (material.map) {
    material.map.colorSpace = SRGBColorSpace
  }

  configureTransparentMaterial(material, renderSettings)

  material.envMapIntensity = profile.envIntensity
  if (typeof material.metalness === 'number') material.metalness = Math.min(material.metalness, 0.95)
  if (typeof material.roughness === 'number') material.roughness = Math.max(material.roughness, 0.38)
  material.needsUpdate = true
}

const ModelScene = ({
  controlsRef,
  isMobile,
  mode,
  onModelReady,
  profile,
  renderSettings,
  resetNonce,
  sceneMode,
  url,
}) => {
  const { scene } = useGLTF(url)
  const { camera } = useThree()
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
    const radius = Math.max(size.length() * scale * 0.5, 1)
    const distance = Math.min(Math.max(radius * (isMobile ? 2.45 : 2.18), 3), isMobile ? 7 : 8.5)

    return {
      bounds: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`,
      cameraPosition: [distance * 0.34, distance * 0.16, distance],
      distance,
      position: [-center.x * scale, -center.y * scale, -center.z * scale],
      scale,
      gridY: bottom,
    }
  }, [displayScene, isMobile])
  const stats = useMemo(() => collectModelStats(displayScene), [displayScene])

  const clayMaterial = useMemo(
    () => new MeshStandardMaterial({
      color: '#b8bdc7',
      roughness: 0.72,
      side: renderSettings.doubleSided ? DoubleSide : FrontSide,
    }),
    [renderSettings.doubleSided],
  )
  const wireMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#71f7ff',
        roughness: 0.6,
        side: renderSettings.doubleSided ? DoubleSide : FrontSide,
        wireframe: true,
      }),
    [renderSettings.doubleSided],
  )

  useEffect(() => {
    const texturedClones = []

    displayScene.traverse((object) => {
      if (!object.isMesh) return

      if (!object.userData.originalMaterial) {
        object.userData.originalMaterial = object.material
      }

      const materials = Array.isArray(object.userData.originalMaterial)
        ? object.userData.originalMaterial
        : [object.userData.originalMaterial]

      materials.filter(Boolean).forEach((material) => prepareStudioMaterial(material, profile, renderSettings))

      object.renderOrder = materials.some((material) => materialUsesTransparency(material, renderSettings)) ? 10 : 0

      if (mode === 'clay') object.material = clayMaterial
      if (mode === 'wireframe') object.material = wireMaterial
      if (mode === 'studio') object.material = object.userData.originalMaterial
      if (mode === 'textured') {
        if (Array.isArray(object.userData.originalMaterial)) {
          object.material = object.userData.originalMaterial.map((material) => {
            const clonedMaterial = cloneTextureMaterial(material, renderSettings)
            texturedClones.push(clonedMaterial)
            return clonedMaterial
          })
        } else {
          object.material = cloneTextureMaterial(object.userData.originalMaterial, renderSettings)
          texturedClones.push(object.material)
        }
      }
    })

    return () => {
      texturedClones.forEach(disposeMaterial)
    }
  }, [clayMaterial, displayScene, mode, profile, renderSettings, wireMaterial])

  useEffect(() => {
    onModelReady({
      ...stats,
      bounds: transform.bounds,
    })
  }, [onModelReady, stats, transform.bounds])

  useEffect(() => {
    const previewCamera = camera
    previewCamera.position.set(...transform.cameraPosition)
    controlsRef.current?.target.set(0, 0, 0)
    controlsRef.current?.update()
  }, [camera, controlsRef, resetNonce, transform.cameraPosition, transform.distance])

  useEffect(() => () => {
    clayMaterial.dispose()
    wireMaterial.dispose()
    disposeObject(displayScene)
    useGLTF.clear(url)
  }, [clayMaterial, displayScene, url, wireMaterial])

  const showGrid = sceneMode === 'grid' || (mode !== 'textured' && profile.grid && sceneMode === 'studio')
  const showContactShadow = !isMobile && mode !== 'textured' && sceneMode !== 'dark'

  return (
    <>
      <primitive
        object={displayScene}
        position={transform.position}
        scale={transform.scale}
        rotation={[0, -0.35, 0]}
      />
      {showGrid && (
        <>
          <Grid
            args={[8, 8]}
            cellColor="#35495c"
            sectionColor="#62d8e8"
            fadeDistance={8}
            fadeStrength={1.35}
            position={[0, transform.gridY, 0]}
          />
        </>
      )}
      {showContactShadow && (
        <ContactShadows
          position={[0, transform.gridY + 0.02, 0]}
          opacity={profile.envIntensity * 0.34}
          scale={6}
          blur={2.4}
          far={3.5}
          color="#020617"
        />
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

const ShowcaseLights = ({ isMobile, profile, sceneMode }) => {
  const isDark = sceneMode === 'dark'

  return (
    <>
      <color attach="background" args={[isDark ? '#02030a' : profile.background]} />
      <hemisphereLight args={['#dbeafe', '#182033', profile.ambient * (isDark ? 0.62 : 0.9)]} />
      <ambientLight intensity={profile.ambient * (isDark ? 0.72 : 1)} />
      <directionalLight
        castShadow={!isMobile}
        color="#ffffff"
        intensity={profile.key * (isDark ? 0.72 : 1)}
        position={[3.5, 4.5, 4.5]}
        shadow-mapSize-width={isMobile ? 1024 : 1536}
        shadow-mapSize-height={isMobile ? 1024 : 1536}
        shadow-bias={-0.00025}
      />
      <directionalLight
        color="#dff8ff"
        intensity={profile.fill * (isDark ? 0.7 : 1)}
        position={[-3.5, 2.2, 2.5]}
      />
      <spotLight
        castShadow={!isMobile}
        color="#fff4df"
        intensity={profile.spot * (isDark ? 0.62 : 1)}
        position={[0, 4.5, 3.2]}
        angle={0.48}
        penumbra={0.65}
        distance={9}
      />
      <pointLight
        color="#9eefff"
        intensity={profile.rim * (isDark ? 0.76 : 1)}
        position={[-2.8, 1.4, -2.5]}
      />
      {!isMobile && (
        <pointLight color="#ff9fe2" intensity={profile.rim * 0.45} position={[2.8, 1.1, -2.8]} />
      )}
    </>
  )
}

const CanvasLoader = ({ copy, timedOut }) => {
  const { progress } = useProgress()
  const percent = Math.max(0, Math.min(100, Math.round(progress || 0)))

  return (
    <Html center className="model-loader" transform={false}>
      <div className="model-loader-card">
        <span className="model-loader-ring" style={{ '--model-load-progress': `${percent * 3.6}deg` }}>
          <strong>{percent}%</strong>
        </span>
        <div>
          <strong>{copy.modelLoadingTitle}</strong>
          <p>{timedOut ? copy.modelLoadingSlow : copy.modelLoadingHint}</p>
        </div>
      </div>
    </Html>
  )
}

const ModelErrorCard = ({ copy, onRetry }) => (
  <div className="model-error-card">
    <span>{copy.modelErrorKicker}</span>
    <strong>{copy.modelErrorTitle}</strong>
    <p>{copy.modelErrorBody}</p>
    <button type="button" className="primary-action" onClick={onRetry}>
      {copy.modelRetry}
    </button>
  </div>
)

const ModelPreview = ({ project, onClose, language = 'zh', copy }) => {
  const assetCategory = useMemo(() => inferAssetCategory(project), [project])
  const profile = viewerProfiles[assetCategory] || viewerProfiles.generic
  const [mode, setMode] = useState(profile.defaultMode)
  const [autoRotate, setAutoRotate] = useState(false)
  const [alphaMode, setAlphaMode] = useState(defaultRenderSettings.alphaMode)
  const [doubleSided, setDoubleSided] = useState(defaultRenderSettings.doubleSided)
  const [sceneMode, setSceneMode] = useState('studio')
  const [infoVisible, setInfoVisible] = useState(true)
  const [modelStats, setModelStats] = useState(emptyModelStats)
  const [retryKey, setRetryKey] = useState(0)
  const [resetNonce, setResetNonce] = useState(0)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const controlsRef = useRef(null)
  const panelRef = useRef(null)
  const projectTitle = pickLocalized(project, 'title', language)
  const projectFormat = translateKnownLabel(
    pickLocalized(project, 'format', language) || copy.modelPreviewFallback,
    language,
  )
  const projectSize = translateKnownLabel(
    pickLocalized(project, 'modelSize', language) || copy.modelUnknown,
    language,
  )
  const downloadPolicy = translateKnownLabel(
    pickLocalized(project, 'downloadPolicy', language) || copy.requestOnly,
    language,
  )

  useEffect(() => {
    setMode(profile.defaultMode)
  }, [profile.defaultMode, project.slug])

  useEffect(() => {
    setModelStats(emptyModelStats)
    setLoadingTimedOut(false)
  }, [project.slug, retryKey])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const updateMobileState = () => setIsMobile(mediaQuery.matches)
    updateMobileState()
    mediaQuery.addEventListener?.('change', updateMobileState)
    return () => mediaQuery.removeEventListener?.('change', updateMobileState)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoadingTimedOut(true), 8000)
    return () => window.clearTimeout(timeout)
  }, [project.slug, retryKey])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const resetView = () => {
    setResetNonce((current) => current + 1)
  }

  const retryModel = () => {
    useGLTF.clear(project.modelUrl)
    setRetryKey((current) => current + 1)
    setLoadingTimedOut(false)
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await panelRef.current?.requestFullscreen?.()
    } else {
      await document.exitFullscreen?.()
    }
  }

  const renderSettings = useMemo(() => ({ alphaMode, doubleSided }), [alphaMode, doubleSided])
  const onModelReady = useMemo(
    () => (stats) => {
      setModelStats(stats)
      setLoadingTimedOut(false)
    },
    [],
  )

  return (
    <div className="model-overlay" role="dialog" aria-modal="true">
      <div className="model-panel" ref={panelRef}>
        <div className="model-toolbar">
          <div>
            <div className="section-kicker mb-1">{copy.modelPreview}</div>
            <h3 className="text-xl font-semibold text-white">
              {projectTitle}
            </h3>
            <p>{isMobile ? copy.modelTouchHint : copy.modelDesktopHint}</p>
          </div>
          <div className="model-toolbar-actions">
            <button type="button" className="mode-button" onClick={toggleFullscreen}>
              {isFullscreen ? copy.viewerExitFullscreen : copy.viewerFullscreen}
            </button>
            <button type="button" className="secondary-action" onClick={onClose}>
              {copy.close}
            </button>
          </div>
        </div>

        <div className="model-controls">
          <span className="model-control-label">{copy.viewerMaterialMode}</span>
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
          <button
            type="button"
            className={infoVisible ? 'mode-button-active' : 'mode-button'}
            onClick={() => setInfoVisible((current) => !current)}
          >
            {copy.viewerInfo}
          </button>
          <span className="model-control-label">{copy.viewerSceneMode}</span>
          {sceneModes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={sceneMode === item.id ? 'mode-button-active' : 'mode-button'}
              onClick={() => setSceneMode(item.id)}
            >
              {copy[item.labelKey]}
            </button>
          ))}
          <button
            type="button"
            className={doubleSided ? 'mode-button-active' : 'mode-button'}
            onClick={() => setDoubleSided((current) => !current)}
          >
            {doubleSided ? copy.doubleSidedOn : copy.doubleSidedOff}
          </button>
          <span className="model-control-label">{copy.alphaMode}</span>
          {alphaModes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={alphaMode === item.id ? 'mode-button-active' : 'mode-button'}
              onClick={() => setAlphaMode(item.id)}
            >
              {copy[item.labelKey]}
            </button>
          ))}
        </div>

        <div className={`model-viewer-body ${infoVisible ? 'model-info-open' : ''}`}>
          <div className={`model-canvas model-canvas-${sceneMode}`}>
            <div className="model-canvas-halo" aria-hidden="true" />
          <Canvas
            camera={{ position: [0, 0.55, 4.8], fov: 42 }}
            dpr={isMobile ? [1, 1.25] : [1, 1.5]}
            shadows={!isMobile}
            gl={{
              antialias: !isMobile,
              outputColorSpace: 'srgb',
              toneMapping: ACESFilmicToneMapping,
              toneMappingExposure: profile.exposure,
            }}
            onCreated={({ gl, scene: canvasScene }) => {
              gl.sortObjects = true
              canvasScene.background = new Color(profile.background)
            }}
          >
            <ModelErrorBoundary
              resetKey={`${project.modelUrl}-${retryKey}`}
              fallback={(
                <Html center transform={false}>
                  <ModelErrorCard copy={copy} onRetry={retryModel} />
                </Html>
              )}
            >
            <Suspense fallback={<CanvasLoader copy={copy} timedOut={loadingTimedOut} />}>
              {profile.useEnvironment && mode !== 'textured' && sceneMode !== 'dark' && <StudioEnvironment />}
              <ShowcaseLights isMobile={isMobile} profile={profile} sceneMode={sceneMode} />
              <ModelScene
                key={`${project.modelUrl}-${retryKey}`}
                controlsRef={controlsRef}
                isMobile={isMobile}
                url={project.modelUrl}
                mode={mode}
                onModelReady={onModelReady}
                profile={profile}
                renderSettings={renderSettings}
                resetNonce={resetNonce}
                sceneMode={sceneMode}
              />
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
            </ModelErrorBoundary>
          </Canvas>
          </div>

          {infoVisible && (
            <aside className="model-info-panel">
              <div>
                <span>{copy.modelInfoTitle}</span>
                <strong>{projectTitle}</strong>
                <p>{copy.modelInfoHint}</p>
              </div>
              <dl className="model-info-grid">
                <div>
                  <dt>{copy.format}</dt>
                  <dd>{projectFormat}</dd>
                </div>
                <div>
                  <dt>{copy.modelSize}</dt>
                  <dd>{projectSize}</dd>
                </div>
                <div>
                  <dt>{copy.modelVertices}</dt>
                  <dd>{formatNumber(modelStats.vertices, copy.modelUnknown)}</dd>
                </div>
                <div>
                  <dt>{copy.modelTriangles}</dt>
                  <dd>{formatNumber(modelStats.triangles, copy.modelUnknown)}</dd>
                </div>
                <div>
                  <dt>{copy.modelMaterials}</dt>
                  <dd>{formatNumber(modelStats.materials, copy.modelUnknown)}</dd>
                </div>
                <div>
                  <dt>{copy.modelTextures}</dt>
                  <dd>{formatNumber(modelStats.textures, copy.modelUnknown)}</dd>
                </div>
                <div>
                  <dt>{copy.modelBounds}</dt>
                  <dd>{modelStats.bounds || copy.modelUnknown}</dd>
                </div>
                <div>
                  <dt>{copy.downloadPolicy}</dt>
                  <dd>{downloadPolicy}</dd>
                </div>
              </dl>
              <div className="model-info-note">
                <strong>{copy.viewerInteraction}</strong>
                <span>{isMobile ? copy.modelTouchHint : copy.modelDesktopHint}</span>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModelPreview
