import { Link } from 'react-router-dom'

// "You can publish here too."
//
// The site became a marketplace and never said so to anyone looking at it.
// A visitor saw works and no hint that publishing was open to them -- which is
// the one thing ADR_PLATFORM_PIVOT §1 is actually about ("anyone can publish").
//
// Signed in it goes to the works panel; signed out to the sign-in page rather
// than to a page that will only tell them to sign in. One click either way.
const PublishCta = ({ authToken, copy }) => (
  <aside className="publish-cta">
    <div>
      <strong>{copy.publishCtaTitle}</strong>
      <p>{copy.publishCtaBody}</p>
    </div>
    <Link className="primary-action" to={authToken ? '/account/works' : '/login?mode=login'}>
      {authToken ? copy.publishCtaAction : copy.publishCtaSignIn}
    </Link>
  </aside>
)

export default PublishCta
