import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Loader, PerformanceMonitor } from '@react-three/drei'
import { Suspense, useState } from 'react'
import { useMediaQuery } from 'react-responsive'
import { easing } from 'maath'
import HeroText from '../components/HeroText'
import { Astronaut } from '../three/objects/Astronaut'
import ParallaxBackground from '../three/scenes/ParallaxBackground'

const Hero = ({ profile, status, language, copy }) => {
  const [dpr, setDpr] = useState(1.5)
  const isMobile = useMediaQuery({ maxWidth: 853 })

  return (
    <section className="hero-stage c-space relative flex min-h-screen items-start justify-center overflow-hidden md:justify-start">
      <HeroText profile={profile} status={status} language={language} copy={copy} />
      <ParallaxBackground />
      <figure
        className="pointer-events-none absolute inset-0"
        style={{ width: '100vw', height: '100vh' }}
        aria-hidden="true"
      >
        <Canvas camera={{ position: [0, 1, 3] }} dpr={dpr}>
          <Suspense fallback={null}>
            <PerformanceMonitor
              onIncline={() => setDpr(1.75)}
              onDecline={() => setDpr(1)}
            />
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 3, 3]} intensity={1} />
            <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
              <Astronaut
                scale={isMobile ? 0.14 : 0.24}
                position={isMobile ? [0.25, -2.25, 0] : [1.65, -1.05, 0]}
              />
            </Float>
            <Rig />
          </Suspense>
        </Canvas>
        <Loader />
      </figure>
    </section>
  )
}

function Rig() {
  useFrame((state, delta) => {
    const x = state.pointer.x
    const y = state.pointer.y
    easing.damp(state.camera.position, [x * 0.8, 1 + y * 0.6, 3], 0.35, delta)
    state.camera.lookAt(0, 0, 0)
  })

  return null
}

export default Hero
