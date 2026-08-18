import { adminLanguages } from '../../lib/admin/i18nAdmin'

// Three languages, one control, and a pill that slides between them rather
// than three buttons that light up. The switcher sits in the sidebar and on
// the sign-in form: the operator who needs it most is the one who cannot read
// the login form yet.
const AdminLanguageSwitcher = ({ label, language, onChange }) => {
  const activeIndex = Math.max(
    0,
    adminLanguages.findIndex((item) => item.code === language),
  )

  return (
    <div aria-label={label} className="admin-lang" role="group" style={{ '--lang-index': activeIndex }}>
      <span aria-hidden="true" className="admin-lang-glider" />
      {adminLanguages.map((item) => (
        <button
          aria-pressed={item.code === language}
          className={item.code === language ? 'admin-lang-item admin-lang-active' : 'admin-lang-item'}
          key={item.code}
          onClick={() => onChange(item.code)}
          title={item.label}
          type="button"
        >
          {item.shortLabel}
        </button>
      ))}
    </div>
  )
}

export default AdminLanguageSwitcher
