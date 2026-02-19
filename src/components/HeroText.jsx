import { FlipWords } from '../components/FlipWords'
import { motion as Motion } from 'motion/react'

const HeroText = () => {
  const words = [
    'High-Quality 3D Models',
    'Optimized Game Assets',
    'Realistic Textures',
    'Creative 3D Designs',
  ]

  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  }

  return (
    <div className="z-10 mt-20 rounded-3xl bg-clip-text text-center md:mt-40 md:text-left">
      <div className="c-space hidden flex-col md:flex">
        <Motion.h1
          className="text-4xl font-medium"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Hi, I&apos;m Right
        </Motion.h1>

        <div className="flex flex-col items-start">
          <Motion.p
            className="text-5xl font-medium text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            A 3D Artist
            <br />
            Dedicated to crafting
          </Motion.p>

          <Motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.5 }}
          >
            <FlipWords words={words} className="text-6xl font-black text-white" />
          </Motion.div>

          <Motion.p
            className="text-4xl font-medium text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            Model Creation
          </Motion.p>
        </div>
      </div>

      <div className="flex flex-col space-y-6 md:hidden">
        <Motion.p
          className="text-4xl font-medium"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Hi, I&apos;m Right
        </Motion.p>

        <div>
          <Motion.p
            className="text-4xl font-black text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            Crafting
          </Motion.p>

          <Motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.5 }}
          >
            <FlipWords words={words} className="text-5xl font-bold text-white" />
          </Motion.div>

          <Motion.p
            className="text-4xl font-black text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            Model Sculpture
          </Motion.p>
        </div>
      </div>
    </div>
  )
}

export default HeroText
