import { getAssetCategoryProfile } from '../../lib/assetCategories'
import { getTranslationStates } from '../../lib/admin/projectEditor'

// The catalogue list. Rows carry the category accent and the per-language
// translation chips so a project missing its Japanese copy is visible without
// opening the editor.
const AdminProjectsSection = ({ onCreate, onDelete, onEdit, projects }) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Projects</h2>
      <div className="flex items-center gap-3">
      <span>{projects.length}</span>
        <button
          type="button"
          className="secondary-action"
          onClick={onCreate}
        >
          New Project
        </button>
      </div>
    </div>
    <div className="admin-table">
      {projects.map((project) => {
        const translationStates = getTranslationStates(project)

        return (
        <article
          key={project.slug}
          className="admin-row"
          style={{ '--category-accent': getAssetCategoryProfile(project).accent }}
        >
          <div>
            <div className="admin-row-title">
              <strong>{project.title}</strong>
              <span>{getAssetCategoryProfile(project).label}</span>
            </div>
            <span>
              {project.slug} · {project.year} ·{' '}
              {project.isPublic === false ? 'hidden' : 'public'}
            </span>
            <p>{project.summary}</p>
            <small>{project.stack?.join(', ')}</small>
            <div className="translation-status-row">
              {translationStates.map((item) => (
                <span key={item.suffix} className={`translation-status-${item.state}`}>
                  {item.suffix.replace('Zh', 'ZH').replace('En', 'EN').replace('Ja', 'JA')}
                  <strong>{item.state}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="admin-actions">
            <span
              className={`status-pill ${
                project.isPublic === false ? 'status-rejected' : 'status-approved'
              }`}
            >
              {project.isPublic === false ? 'hidden' : 'public'}
            </span>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onEdit(project)}
            >
              Edit
            </button>
            <button
              type="button"
              className="danger-action"
              onClick={() => onDelete(project)}
            >
              Delete
            </button>
          </div>
        </article>
        )
      })}
      {projects.length === 0 && (
        <p className="text-sm text-neutral-500">No projects match this search.</p>
      )}
    </div>
  </section>
)

export default AdminProjectsSection
