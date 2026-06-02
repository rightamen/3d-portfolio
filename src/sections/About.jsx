import { useRef } from 'react'
import Card from '../components/Card'

const About = ({ profile, skills = [] }) => {
  const grid2Container = useRef(null)
  const visibleSkills = skills.slice(0, 8)

  return (
    <section id="about" className="c-space section-space">
      <div className="section-kicker">About</div>
      <h2 className="text-heading">About Me</h2>

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
            <p className="text-lg font-semibold tracking-wide">Hi, I&apos;m Right</p>

            <p className="text-[clamp(0.9rem,1.5vw,1rem)] leading-relaxed opacity-90">
              {profile?.aboutZh ||
                '我是一名以三维空间为主要媒介的数字艺术创作者，专注于形体语言、视觉结构、材质与光影之间的表达。'}
            </p>

            <div className="h-px w-12 bg-white/20" />

            <p className="text-[clamp(0.8rem,1.3vw,0.95rem)] leading-relaxed opacity-80">
              {profile?.intro ||
                'I create sculptural digital forms, realtime presentation scenes, and portfolio systems for the web.'}
            </p>

            <div className="h-4" />
          </div>
        </div>

        <div className="grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="relative flex h-full w-full items-center justify-center"
          >
            <p className="flex items-end text-5xl text-gray-500">MODEL IS CRAFT</p>
            <Card rotate={30} style={{ top: '30%', left: '20%' }} text="Form" containerRef={grid2Container} />
            <Card rotate={-30} style={{ top: '60%', left: '45%' }} text="Structure" containerRef={grid2Container} />
            <Card rotate={90} style={{ bottom: '30%', left: '70%' }} text="Light" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '55%', left: '0%' }} text="Materiality" containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '10%', left: '30%' }} text="Sculptural" containerRef={grid2Container} />
            <Card rotate={30} style={{ top: '70%', left: '70%' }} image="/assets/logos/autodesk-max.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '70%', left: '25%' }} image="/assets/logos/autodeskmaya.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '5%', left: '10%' }} image="/assets/logos/blender.svg" containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '25%', left: '70%' }} image="/assets/logos/zbrush.svg" containerRef={grid2Container} />
          </div>
        </div>

        <div className="grid-black-color grid-3">
          <p className="headtext">Deployment-ready</p>
          <p className="subtext">
            A Node API, production static hosting, and contact capture are now
            part of the portfolio.
          </p>
        </div>

        <div className="grid-special-color grid-4">
          <p className="headtext">Focus</p>
          <p className="subtext">
            Sculptural clarity, realtime presentation, material rhythm, and a
            memorable first screen.
          </p>
        </div>

        <div className="grid-default-color grid-5">
          <p className="headtext">Toolbox</p>
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
