import { useMemo, useState } from 'react'

import WorkCard from '../components/WorkCard'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'

// The homepage catalogue.
//
// It used to be a grid of rich cards -- category badge, year, format, title,
// summary paragraph, stack pills, a model-preview button and a details link --
// which is a product listing rather than a thumbnail. It is now the same tile
// /explore and the creator profiles use, for two reasons: a browsing art site
// shows work, not descriptions of work; and two implementations of one card
// drift apart, which these two already had.
//
// The model viewer moved with it. It lives on the work page, which is where
// somebody who has chosen a work is -- rather than on every tile of a grid
// they are still scanning.
const Projects = ({ copy, language, projects = [] }) => {
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
        : projects.filter(
            (project) => getAssetCategoryProfile(project, language).value === activeCategory,
          ),
    [activeCategory, language, projects],
  )

  return (
    <section id="projects" className="c-space section-space">
      <div className="section-kicker">{copy.projectsKicker}</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 className="text-heading">{copy.projectsTitle}</h2>
        <p className="max-w-xl text-neutral-400">{copy.projectsIntro}</p>
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

          return (
            <button
              key={category.value}
              type="button"
              className={activeCategory === category.value ? 'asset-filter-active' : 'asset-filter'}
              style={{ '--category-accent': category.accent }}
              onClick={() => setActiveCategory(category.value)}
            >
              <span>{category.shortLabel}</span>
              <strong>{categoryCounts.get(category.value) || 0}</strong>
            </button>
          )
        })}
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
      {visibleProjects.length === 0 ? (
        <div className="asset-empty-state">
          <strong>{copy.emptyCategoryTitle}</strong>
          <span>{copy.emptyCategoryBody}</span>
        </div>
      ) : (
        <div className="explore-grid">
          {visibleProjects.map((work) => (
            <WorkCard copy={copy} key={work.slug} language={language} work={work} />
          ))}
        </div>
      )}
    </section>
  )
}

export default Projects
