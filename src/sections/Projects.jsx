import { motion as Motion } from 'motion/react'

const Projects = ({ projects = [] }) => {
  return (
    <section id="projects" className="c-space section-space">
      <div className="section-kicker">Selected Work</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 className="text-heading">Projects shaped for screens and space</h2>
        <p className="max-w-xl text-neutral-400">
          A compact look at 3D craft, realtime presentation, and visual systems
          built with production-minded restraint.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects.map((project, index) => (
          <Motion.article
            key={project.slug}
            className="project-card group"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
          >
            <div className="project-media">
              <img src={project.image} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div>
                <div className="text-sm text-aqua">{project.year}</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {project.title}
                </h3>
                <p className="mt-3 leading-relaxed text-neutral-400">
                  {project.summary}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {project.stack.map((tag) => (
                  <span key={tag} className="skill-pill">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Motion.article>
        ))}
      </div>
    </section>
  )
}

export default Projects
