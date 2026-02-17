import { motion, useScroll, useTransform, useSpring } from "motion/react"

const ParallaxBackground = () => {
  const { scrollYProgress } = useScroll()

  // ⭐ 视差 easing（弹簧平滑）
  const smooth = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 20,
    mass: 0.4,
  })

  // ⭐ 深度层速度分离
  const mountain3Y = useTransform(smooth, [0, 1], ["0%", "80%"])
  const mountain2Y = useTransform(smooth, [0, 1], ["0%", "40%"])
  const mountain1Y = useTransform(smooth, [0, 1], ["0%", "10%"])
  const planetsX = useTransform(smooth, [0, 1], ["0%", "-30%"])

  // ⭐ 深度模糊（远景更模糊）
  const blurFar = useTransform(smooth, [0, 1], ["2px", "6px"])
  const blurMid = useTransform(smooth, [0, 1], ["1px", "3px"])

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
      <motion.div
        className="absolute inset-0 -z-40"
        style={{
          backgroundImage: "url(/assets/mountain-3.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          y: mountain3Y,
          filter: blurFar,

          // ⭐ GPU合成关键
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />

      {/* ================= Planets ================= */}
      <motion.div
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
      <motion.div
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
      <motion.div
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
  )
}

export default ParallaxBackground