import { motion as Motion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'
import { pickLocalized } from '../lib/i18n'

const ModelPreview = lazy(() => import('../components/ModelPreview'))
const ProjectDetail = lazy(() => import('../components/ProjectDetail'))

const Projects = ({ projects = [], language, copy }) => {
  const [previewProject, setPreviewProject] = useState(null)
  const [detailSlug, setDetailSlug] = useState(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const categoryCounts = useMemo(() => {
    const counts = new Map(assetCategoryProfiles.map((category) => [category.value, 0]))

    projects.forEach((project) => {
      const category = getAssetCategoryProfile(project, language)
      counts.set(category.value, (counts.get(category.value) || 0) + 1)
    })

    return counts
  }, [language, projects])
  const visibleProjects = useMemo(
    () =>
      activeCategory === 'all'
        ? projects
        : projects.filter((project) => getAssetCategoryProfile(project, language).value === activeCategory),
    [activeCategory, language, projects],
  )

  return (
    <section id="projects" className="c-space section-space">
      <div className="section-kicker">{copy.projectsKicker}</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 className="text-heading">{copy.projectsTitle}</h2>
        <p className="max-w-xl text-neutral-400">
          {copy.projectsIntro}
        </p>
      </div>

      <div className="asset-filter-panel">
        <button
          type="button"
          className={activeCategory === 'all' ? 'asset-filter-active' : 'asset-filter'}
          onClick={() => setActiveCategory('all')}
        >
          <span>{copy.allWork}</span>
          <strong>{projects.length}</strong>
        </button>
        {assetCategoryProfiles.map((categoryBase) => {
          const category = getAssetCategoryProfile({ assetCategory: categoryBase.value }, language)
          const count = categoryCounts.get(category.value) || 0

          return (
            <button
              key={category.value}
              type="button"
              className={activeCategory === category.value ? 'asset-filter-active' : 'asset-filter'}
              style={{ '--category-accent': category.accent }}
              onClick={() => setActiveCategory(category.value)}
            >
              <span>{category.shortLabel}</span>
              <strong>{count}</strong>
            </button>
          )
        })}
      </div>

      <div className="asset-category-strip">
        {(activeCategory === 'all'
          ? assetCategoryProfiles
          : assetCategoryProfiles.filter((category) => category.value === activeCategory)
        ).map((categoryBase) => {
          const category = getAssetCategoryProfile({ assetCategory: categoryBase.value }, language)

          return (
          <div
            key={category.value}
            className={`asset-category-summary ${
              (categoryCounts.get(category.value) || 0) === 0 ? 'asset-category-empty' : ''
            }`}
            style={{ '--category-accent': category.accent }}
          >
            <div className="asset-category-heading">
              <span>{category.label}</span>
              <strong>
                {(categoryCounts.get(category.value) || 0) > 0
                  ? `${categoryCounts.get(category.value)} ${copy.workCount}`
                  : copy.waitingUpload}
              </strong>
            </div>
            <p>{category.description}</p>
          </div>
          )
        })}
      </div>

      {visibleProjects.length === 0 && (
        <div className="asset-empty-state">
          <strong>{copy.emptyCategoryTitle}</strong>
          <span>{copy.emptyCategoryBody}</span>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {visibleProjects.map((project, index) => {
          const category = getAssetCategoryProfile(project, language)
          const title = pickLocalized(project, 'title', language)
          const summary = pickLocalized(project, 'summary', language)

          return (
          <Motion.article
            key={project.slug}
            className="project-card group"
            style={{ '--category-accent': category.accent }}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
          >
            <div className="project-media">
              <img src={project.image} alt="" className="h-full w-full object-cover" />
              <span className="project-category-badge">{category.label}</span>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div>
                <div className="project-card-meta">
                  <span>{project.year}</span>
                  <span>{pickLocalized(project, 'format', language) || category.shortLabel}</span>
                </div>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-3 leading-relaxed text-neutral-400">
                  {summary}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {project.stack.map((tag) => (
                  <span key={tag} className="skill-pill">
                    {tag}
                  </span>
                ))}
              </div>
              {project.modelUrl && (
                <button
                  type="button"
                  className="secondary-action mt-2 w-full"
                  onClick={() => setPreviewProject(project)}
                >
                  {copy.openModelPreview}
                </button>
              )}
              <button
                type="button"
                className="primary-action w-full"
                onClick={() => setDetailSlug(project.slug)}
              >
                {copy.viewDetails}
              </button>
            </div>
          </Motion.article>
          )
        })}
      </div>

      {previewProject && (
        <Suspense fallback={null}>
          <ModelPreview
            project={previewProject}
            language={language}
            copy={copy}
            onClose={() => setPreviewProject(null)}
          />
        </Suspense>
      )}

      {detailSlug && (
        <Suspense fallback={null}>
          <ProjectDetail
            key={detailSlug}
            slug={detailSlug}
            language={language}
            copy={copy}
            onClose={() => setDetailSlug(null)}
          />
        </Suspense>
      )}
    </section>
  )
}

export default Projects
