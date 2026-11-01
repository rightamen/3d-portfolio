import { Link } from 'react-router-dom'
const Footer = ({ profile, copy }) => (
  <footer id="footer" className="studio-footer c-space">
    <div><Link className="studio-footer-brand" to="/">mrright<span>.blog</span></Link><p>{copy.footerLine}</p></div>
    <nav aria-label={copy.studioFooterNav}><Link to="/explore">{copy.navExplore}</Link><Link to="/community">{copy.navCommunity}</Link><Link to="/account">{copy.account}</Link></nav>
    <small>© {new Date().getFullYear()} {profile?.domain || 'mrright.blog'}</small>
  </footer>
)
export default Footer
