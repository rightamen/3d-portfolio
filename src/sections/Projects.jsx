import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import WorkCard from '../components/WorkCard'
import InfiniteWorks from '../components/InfiniteWorks'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'

// The catalogue is fetched once by the homepage; both views and all category
// filters reuse it. Infinite mode repeats these real works in a bounded tile
// pool, while grid mode keeps a conventional list for focused browsing.
const Projects = ({ copy, language, projects = [], status = 'ready' }) => {
  const [activeCategory, setActiveCategory] = useState('all')
  const [view, setView] = useState('infinite')

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
        : projects.filter(
            (project) => getAssetCategoryProfile(project, language).value === activeCategory,
          ),
    [activeCategory, language, projects],
  )

  return (
    <section id="projects" className="c-space mt-16 md:mt-20">
      <div className="section-kicker">{copy.projectsKicker}</div>
      <div className="studio-section-heading">
        <h2 className="text-heading">{copy.projectsTitle}</h2>
        <p className="studio-section-intro">{copy.projectsIntro}</p>
        <Link className="studio-view-all" to="/explore">{copy.studioViewAll}<span aria-hidden="true">↗</span></Link>
      </div>

      <div className="exhibit-browse-bar">
      <div className="asset-filter-panel">
        <button
          type="button"
          className={activeCategory === 'all' ? 'asset-filter-active' : 'asset-filter'}
          onClick={() => setActiveCategory('all')}
          aria-pressed={activeCategory === 'all'}
        >
          <span>{copy.allWork}</span>
          <strong>{projects.length}</strong>
        </button>
        {assetCategoryProfiles.map((categoryBase) => {
          const category = getAssetCategoryProfile({ assetCategory: categoryBase.value }, language)

          return (
            <button
              key={category.value}
              type="button"
              className={activeCategory === category.value ? 'asset-filter-active' : 'asset-filter'}
              style={{ '--category-accent': category.accent }}
              onClick={() => setActiveCategory(category.value)}
              aria-pressed={activeCategory === category.value}
            >
              <span>{category.shortLabel}</span>
              <strong>{categoryCounts.get(category.value) || 0}</strong>
            </button>
          )
        })}
      </div>

      <div className="exhibit-view-toggle" role="group" aria-label={copy.infiniteView}>
        <button type="button" aria-pressed={view === 'infinite'} onClick={() => setView('infinite')}><span aria-hidden="true">∞</span>{copy.infiniteView}</button>
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><span aria-hidden="true">▦</span>{copy.spatialGrid}</button>
      </div>
      </div>

      {/* Only for the category actually chosen. Rendering all six on "all" put
          1096px of explanation between the heading and the first work at
          440px; the text is one chip away instead. */}
      <div className="asset-category-strip">
        {(activeCategory === 'all'
          ? []
          : assetCategoryProfiles.filter((category) => category.value === activeCategory)
        ).map((categoryBase) => {
          const category = getAssetCategoryProfile({ assetCategory: categoryBase.value }, language)
          const count = categoryCounts.get(category.value) || 0

          return (
            <div
              key={category.value}
              className={`asset-category-summary ${count === 0 ? 'asset-category-empty' : ''}`}
              style={{ '--category-accent': category.accent }}
            >
              <div className="asset-category-heading">
                <span>{category.label}</span>
                <strong>{count > 0 ? `${count} ${copy.workCount}` : copy.waitingUpload}</strong>
              </div>
              <p>{category.description}</p>
            </div>
          )
        })}
      </div>

      {/* The empty state came back here after the redesign dropped it: filter
          to a category nobody has published in and a grid with no message is a
          page that looks broken rather than empty. The i18n usage test is what
          noticed, by reporting its two strings as unrendered. */}
      {status === 'loading' ? (
        <p className="text-neutral-400" role="status">{copy.exploreLoading}</p>
      ) : status === 'error' ? (
        <p className="text-coral">{copy.exploreLoadError}</p>
      ) : visibleProjects.length === 0 ? (
        <div className="asset-empty-state">
          <strong>{copy.emptyCategoryTitle}</strong>
          <span>{copy.emptyCategoryBody}</span>
        </div>
      ) : view === 'infinite' ? (
        <InfiniteWorks key={activeCategory} works={visibleProjects} copy={copy} language={language} />
      ) : (
        <div className="explore-grid">
          {visibleProjects.map((work) => (
            <WorkCard copy={copy} key={work.id || work.url} language={language} work={work} />
          ))}
        </div>
      )}
    </section>
  )
}

export default Projects
