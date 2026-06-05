import { useRef } from 'react'
import Card from '../components/Card'

const About = ({ profile, skills = [] }) => {
  const grid2Container = useRef(null)
  const visibleSkills = skills.slice(0, 8)

  return (
    <section id="about" className="c-space section-space">
      <div className="section-kicker">关于我</div>
      <h2 className="text-heading">模型创作与资产呈现</h2>

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
            <p className="text-lg font-semibold tracking-wide">你好，我是 Right</p>

            <p className="text-[clamp(0.9rem,1.5vw,1rem)] leading-relaxed opacity-90">
              {profile?.aboutZh ||
                '我是一名模型创作者，主要制作角色、道具与场景资产，关注形体语言、拓扑结构、材质贴图与光影表现。'}
            </p>

            <div className="h-px w-12 bg-white/20" />

            <p className="text-[clamp(0.8rem,1.3vw,0.95rem)] leading-relaxed opacity-80">
              {profile?.intro ||
                '我专注于角色、道具、场景等三维模型资产，重视造型、材质、贴图和最终展示效果。'}
            </p>

            <div className="h-4" />
          </div>
        </div>

        <div className="grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="relative flex h-full w-full items-center justify-center"
          >
            <p className="flex items-end text-5xl text-gray-500">模型即作品</p>
            <Card rotate={30} style={{ top: '30%', left: '20%' }} text="造型" containerRef={grid2Container} />
            <Card rotate={-30} style={{ top: '60%', left: '45%' }} text="结构" containerRef={grid2Container} />
            <Card rotate={90} style={{ bottom: '30%', left: '70%' }} text="光影" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '55%', left: '0%' }} text="材质" containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '10%', left: '30%' }} text="雕塑感" containerRef={grid2Container} />
            <Card rotate={30} style={{ top: '70%', left: '70%' }} image="/assets/logos/autodesk-max.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '70%', left: '25%' }} image="/assets/logos/autodeskmaya.svg" containerRef={grid2Container} />
            <Card rotate={-45} style={{ top: '5%', left: '10%' }} image="/assets/logos/blender.svg" containerRef={grid2Container} />
            <Card rotate={20} style={{ top: '25%', left: '70%' }} image="/assets/logos/zbrush.svg" containerRef={grid2Container} />
          </div>
        </div>

        <div className="grid-black-color grid-3">
          <p className="headtext">作品管理</p>
          <p className="subtext">
            将角色、道具、场景和贴图作品按资产类型整理，方便持续更新、
            展示和授权管理。
          </p>
        </div>

        <div className="grid-special-color grid-4">
          <p className="headtext">创作重点</p>
          <p className="subtext">
            造型比例、轮廓识别、材质质感、贴图颜色，以及最终画面表现力。
          </p>
        </div>

        <div className="grid-default-color grid-5">
          <p className="headtext">工具箱</p>
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
