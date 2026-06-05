import { motion as Motion } from 'motion/react'
import { FlipWords } from './FlipWords'
import { pickLocalized } from '../lib/i18n'

const HeroText = ({ profile, status, language, copy }) => {
  const words = copy.heroWords
  const name = profile?.name || 'Right'
  const title = pickLocalized(profile, 'title', language) || copy.heroTitle

  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  }

  return (
    <div className="relative z-10 mt-20 max-w-4xl rounded-3xl bg-clip-text text-center drop-shadow-[0_3px_18px_rgba(0,0,0,0.65)] md:mt-40 md:text-left">
      <div className="hidden flex-col md:flex">
        <Motion.h1
          className="text-4xl font-medium"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          {copy.heroGreeting} {name}
        </Motion.h1>

        <div className="flex flex-col items-start">
          <Motion.p
            className="mt-5 text-5xl font-medium text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            {copy.heroLine1}
            <br />
            {copy.heroLine2}
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
            className="mt-3 max-w-2xl text-2xl font-medium leading-relaxed text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            {title}
          </Motion.p>
          <Motion.div
            className="mt-7 flex items-center gap-3"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 2 }}
          >
            <a href="#projects" className="primary-action">
              {copy.heroProjects}
            </a>
            <a href="#contact" className="secondary-action">
              {copy.heroContact}
            </a>
          </Motion.div>
        </div>
      </div>

      <div className="flex max-w-[21rem] flex-col space-y-4 md:hidden">
        <Motion.p
          className="text-3xl font-medium"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          {copy.heroGreeting} {name}
        </Motion.p>

        <div>
          <Motion.p
            className="text-3xl font-black text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.2 }}
          >
            {copy.heroMobileLine}
          </Motion.p>

          <Motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.5 }}
          >
            <FlipWords words={words} className="text-4xl font-bold text-white" />
          </Motion.div>

          <Motion.p
            className="text-2xl font-black text-neutral-300"
            variants={variants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 1.8 }}
          >
            {copy.heroMobileSubtitle}
          </Motion.p>
        </div>
        <p className="mx-auto max-w-xs text-sm leading-relaxed text-neutral-200">
          {status === 'error'
            ? copy.heroError
            : title}
        </p>
      </div>
    </div>
  )
}

export default HeroText
