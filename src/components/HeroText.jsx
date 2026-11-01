import { Link } from 'react-router-dom'
const HeroText = ({ copy, visitorToken }) => (
  <div className="studio-hero-copy">
    <div className="atelier-heading">
      <p className="studio-eyebrow"><span />{copy.heroEyebrow}</p>
      <h1>{copy.heroHeadline1}<br /><em>{copy.heroHeadline2}</em></h1>
    </div>
    <div className="atelier-support">
      <p className="studio-hero-description">{copy.heroLead}</p>
      <div className="studio-hero-actions">
        <Link className="primary-action" to="/explore">{copy.heroBrowse}<span aria-hidden="true">↗</span></Link>
        <Link className="studio-text-link" to={visitorToken ? '/account/works' : '/login?mode=login'}>{copy.heroPublish}<span aria-hidden="true">＋</span></Link>
      </div>
      <div className="studio-hero-types">{copy.heroWords.map((word)=><span key={word}>{word}</span>)}</div>
      <div className="studio-hero-foot"><span aria-hidden="true">◇</span><span>{copy.studioHeroNote}</span></div>
    </div>
  </div>
)
export default HeroText
