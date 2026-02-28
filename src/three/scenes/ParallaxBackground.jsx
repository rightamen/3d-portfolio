import { motion as Motion } from "motion/react";
import useParallaxEffect from "../hooks/useParallaxEffect";

const ParallaxBackground = () => {
  const { mountain3Y, mountain2Y, mountain1Y, planetsX, blurFar, blurMid } =
    useParallaxEffect();

  return (
    <section className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* ================= Sky ================= */}
      <div
        className="absolute inset-0 -z-50"
        style={{
          backgroundImage: "url(/assets/sky.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* ⭐ 光晕渐变层 */}
      <div
        className="
          absolute inset-0 -z-45
          bg-gradient-to-b
          from-indigo-500/20
          via-transparent
          to-black/60
          mix-blend-screen
        "
      />

      {/* ================= Far Mountain ================= */}
      <Motion.div
        className="absolute inset-0 -z-40"
        style={{
          backgroundImage: "url(/assets/mountain-3.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          y: mountain3Y,
          filter: blurFar,
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />

      {/* ================= Planets ================= */}
      <Motion.div
        className="absolute inset-0 -z-30"
        style={{
          backgroundImage: "url(/assets/planets.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          x: planetsX,
          filter: blurMid,
          willChange: "transform",
          transform: "translate3d(0,0,0)",
        }}
      />

      {/* ================= Mid Mountain ================= */}
      <Motion.div
        className="absolute inset-0 -z-20"
        style={{
          backgroundImage: "url(/assets/mountain-2.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          y: mountain2Y,
          willChange: "transform",
        }}
      />

      {/* ================= Near Mountain ================= */}
      <Motion.div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: "url(/assets/mountain-1.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          y: mountain1Y,
          willChange: "transform",
        }}
      />
    </section>
  );
};

export default ParallaxBackground;
