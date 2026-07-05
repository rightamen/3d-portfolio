import { pickLocalized } from '../lib/i18n'

const Experience = ({ experience = [], skills = [], language, copy }) => {
  return (
    <section id="experience" className="c-space section-space">
      <div className="section-kicker">{copy.experienceKicker}</div>
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h2 className="text-heading">
            {copy.experienceTitle}
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-neutral-400">
            {copy.experienceIntro}
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
              <h3 className="mt-2 text-xl font-semibold text-white">
                {pickLocalized(item, 'title', language)}
              </h3>
              <p className="mt-3 leading-relaxed text-neutral-400">
                {pickLocalized(item, 'body', language)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Experience
