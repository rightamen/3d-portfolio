import { getAssetCategoryProfile } from '../../lib/assetCategories'
import { getTranslationStates } from '../../lib/admin/projectEditor'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// The catalogue list. Rows carry the category accent and the per-language
// translation chips so a project missing its Japanese copy is visible without
// opening the editor.
const AdminProjectsSection = ({ onCreate, onDelete, onEdit, projects }) => {
  const { fmt, language, t } = useAdminI18n()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('projects.title')}</h2>
        <div className="flex items-center gap-3">
          <span>{fmt.formatNumber(projects.length)}</span>
          <button className="secondary-action" onClick={onCreate} type="button">
            {t('projects.new')}
          </button>
        </div>
      </div>
      <div className="admin-table">
        {projects.map((project, index) => {
          const translationStates = getTranslationStates(project)
          const category = getAssetCategoryProfile(project, language)
          const visibility = project.isPublic === false ? 'hidden' : 'public'

          return (
            <article
              className="admin-row admin-animate-in"
              key={project.slug}
              style={{ ...stagger(index), '--category-accent': category.accent }}
            >
              <div>
                <div className="admin-row-title">
                  <strong>{project.title}</strong>
                  <span>{category.label}</span>
                </div>
                <span>
                  {t('projects.meta', {
                    slug: project.slug,
                    visibility: t(`status.${visibility}`),
                    year: project.year,
                  })}
                </span>
                <p>{project.summary}</p>
                <small>{project.stack?.join(', ')}</small>
                <div className="translation-status-row">
                  {translationStates.map((item) => (
                    <span className={`translation-status-${item.state}`} key={item.suffix}>
                      {item.suffix.replace('Zh', 'ZH').replace('En', 'EN').replace('Ja', 'JA')}
                      <strong>{t(`translation.${item.state}`)}</strong>
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
                  {t(`status.${visibility}`)}
                </span>
                <button className="secondary-action" onClick={() => onEdit(project)} type="button">
                  {t('common.edit')}
                </button>
                <button className="danger-action" onClick={() => onDelete(project)} type="button">
                  {t('common.delete')}
                </button>
              </div>
            </article>
          )
        })}
        {projects.length === 0 && (
          <p className="text-sm text-neutral-500">{t('projects.empty')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminProjectsSection
