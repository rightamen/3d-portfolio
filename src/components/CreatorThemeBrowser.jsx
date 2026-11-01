import { Link } from 'react-router-dom'
import { THEME_PRESETS } from '../../server/themes.js'

// Browsing a theme changes this page instance only. Account settings remain the
// authenticated, explicit save path for the creator's published appearance.
const CreatorThemeBrowser = ({ copy, language, selectedId, onSelect }) => (
  <details className="creator-theme-browser">
    <summary>{copy.themeBrowse}<span>{selectedId ? THEME_PRESETS.find(item => item.id === selectedId)?.labels[language] : copy.themeBrowseHint}<i aria-hidden="true">＋</i></span></summary>
    <div className="creator-theme-choices" role="group" aria-label={copy.themePresets}>
      {THEME_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={selectedId === preset.id} onClick={() => onSelect(preset.id)}>
        <span className="creator-theme-dot" style={{ background: preset.theme.accent, borderColor: preset.theme.accent, boxShadow: '0 0 0 5px ' + (preset.theme.surface === 'paper' ? '#f1eee6' : preset.theme.surface === 'porcelain' ? '#f3f4f8' : '#161820') }} aria-hidden="true" />{preset.labels[language] || preset.labels.en}
      </button>)}
    </div>
    <div className="creator-theme-preview-note"><p role="status">{selectedId ? copy.themeBrowseNotice : copy.themeBrowseExplanation}</p><div>{selectedId && <button type="button" onClick={() => onSelect('')}>{copy.themeRestoreCreator}</button>}<Link to="/account/settings">{copy.themeChooseMine}<span aria-hidden="true">↗</span></Link></div></div>
  </details>
)
export default CreatorThemeBrowser
