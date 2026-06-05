import { useRef } from 'react'
import Card from '../components/Card'
import { pickLocalized } from '../lib/i18n'

const About = ({ profile, skills = [], language, copy }) => {
  const grid2Container = useRef(null)
  const visibleSkills = skills.slice(0, 8)
  const cardLabels = copy.aboutCards

  return (
    <section id="about" className="c-space section-space">
      <div className="section-kicker">{copy.aboutKicker}</div>
      <h2 className="text-heading">{copy.aboutTitle}</h2>

      <div className="mt-12 grid grid-cols-1 gap-4 auto-rows-auto md:grid-cols-6 md:auto-rows-[18rem]">
        <div className="relative grid-default-color grid-1 overflow-hidden">
          <img
            src="/assets/coding-pov.png"
            alt=""
            className="pointer-events-none absolute right-[-3rem] top-[-1rem] scale-[1.2] opacity-20 md:right-[-6rem] md:scale-[2.5] md:opacity-100"
          />

          <div
            className="relative z-10 h-full space-y-4 overflow-y-auto overscroll-contain p-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <p className="text-lg font-semibold tracking-wide">{copy.aboutGreeting}</p>

            <p className="text-[clamp(0.9rem,1.5vw,1rem)] leading-relaxed opacity-90">
              {pickLocalized(profile, 'about', language) || copy.aboutBody}
            </p>

            <div className="h-px w-12 bg-white/20" />

            <p className="text-[clamp(0.8rem,1.3vw,0.95rem)] leading-relaxed opacity-80">
              {pickLocalized(profile, 'intro', language) || copy.aboutIntro}
            </p>

            <div className="h-4" />
          </div>
        </div>

        <div className="grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="relative flex h-full w-full items-center justify-center"
          >
            <p className="flex items-end text-5xl text-gray-500">{copy.aboutCraft}</p>
            <Card rotate={30} style={{ top: '30%', left: '20%' }} text={cardLabels[0]} containerRef={grid2Container} />
            <Card rotate={-30} style={{ top: '60%', left: '45%' }} text={cardLabels[1]} containerRef={grid2Container} />
            <Card rotate={90} style={{ bottom: '30%', left: '70%' }} text={cardLabels[2]} containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '55%', left: '0%' }} text={cardLabels[3]} containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '10%', left: '30%' }} text={cardLabels[4]} containerRef={grid2Container} />
            <Card rotate={30} style={{ top: '70%', left: '70%' }} image="/assets/logos/autodesk-max.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '70%', left: '25%' }} image="/assets/logos/autodeskmaya.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '5%', left: '10%' }} image="/assets/logos/blender.svg" containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '25%', left: '70%' }} image="/assets/logos/zbrush.svg" containerRef={grid2Container} />
          </div>
        </div>

        <div className="grid-black-color grid-3">
          <p className="headtext">{copy.aboutManagementTitle}</p>
          <p className="subtext">
            {copy.aboutManagementBody}
          </p>
        </div>

        <div className="grid-special-color grid-4">
          <p className="headtext">{copy.aboutFocusTitle}</p>
          <p className="subtext">
            {copy.aboutFocusBody}
          </p>
        </div>

        <div className="grid-default-color grid-5">
          <p className="headtext">{copy.aboutToolsTitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleSkills.map((skill) => (
              <span key={skill} className="skill-pill">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default About
