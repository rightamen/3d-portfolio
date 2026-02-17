import { Canvas } from "@react-three/fiber";
import { Astronaut } from "../components/Astronaut";
import HeroText from "../components/HeroText";
import ParallaxBackground from "../components/ParallaxBackground";
import { Float, Loader } from "@react-three/drei";
import { useMediaQuery } from "react-responsive";
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { Suspense } from "react";
const Hero = () => {
  const isMobile = useMediaQuery({ maxWidth: 853 }); // 简单的移动设备检测
  return (
    <section
      className="
        c-space
        flex
        min-h-screen
        items-start
        justify-center
        overflow-hidden
        md:items-start
        md:justify-start
      "
    >
      <HeroText />
      <ParallaxBackground />
      <figure
        className="absolute inset-0"
        style={{ width: "100vw", height: "100vh" }}
      >
        <Canvas camera={{ position: [0, 1, 3] }}>
          <Suspense fallback={null}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 3, 3]} intensity={1} />

            <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
              <Astronaut
                scale={isMobile ? 0.23 : 0.3}
                position={isMobile ? [0, -1.5, 0] : [1.3, -1, 0]}
              />
            </Float>

            <Rig />
          </Suspense>
        </Canvas>

        <Loader />
      </figure>
    </section>
  );
};

function Rig() {
  useFrame((state, delta) => {
    const x = state.pointer.x;
    const y = state.pointer.y;

    easing.damp(state.camera.position, [x * 0.8, 1 + y * 0.6, 3], 0.35, delta);

    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

export default Hero;
