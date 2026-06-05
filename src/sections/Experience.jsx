const Experience = ({ experience = [], skills = [] }) => {
  return (
    <section id="experience" className="c-space section-space">
      <div className="section-kicker">创作经历</div>
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h2 className="text-heading">
            围绕造型、光影与交互建立的创作流程
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-neutral-400">
            从建模、材质、灯光到网页端三维展示，持续打磨作品在浏览器中的
            真实观看体验。
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {skills.map((tool) => (
              <span key={tool} className="skill-pill">
                {tool}
              </span>
            ))}
          </div>
        </div>

        <div className="timeline-panel">
          {experience.map((item) => (
            <article key={item.title} className="timeline-item">
              <span className="text-sm uppercase tracking-[0.16em] text-aqua">
                {item.period}
              </span>
              <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-neutral-400">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Experience
