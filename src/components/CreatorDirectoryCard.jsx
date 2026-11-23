import { Link } from 'react-router-dom'
import CreatorNumber from './CreatorNumber'
import SocialActions from './SocialActions'

const CreatorDirectoryCard = ({ authToken, copy, creator, showActions = false, visitorUser, heading = 'h3' }) => {
  const Heading = heading
  const profileUrl = '/u/' + creator.handle
  const own = Boolean(authToken && visitorUser?.handle === creator.handle)

  return (
    <article className="creator-directory-card">
      <header>
        <Link className="social-person-avatar" to={profileUrl} aria-label={creator.displayName}>
          {creator.avatarUrl ? <img src={creator.avatarUrl} alt="" /> : creator.displayName?.slice(0, 1) || '◇'}
        </Link>
        <div>
          <Heading><Link to={profileUrl}>{creator.displayName}</Link></Heading>
          <p>@{creator.handle}</p>
        </div>
      </header>
      {creator.bio && <p className="creator-directory-bio">{creator.bio}</p>}
      <div className="creator-directory-meta">
        <CreatorNumber copy={copy} number={creator.creatorNumber} />
        <span>{copy.socialPublishedWorks} <b>{creator.workCount}</b></span>
        {creator.location && <span>{creator.location}</span>}
      </div>
      {showActions && (own ? (
        <div className="social-self-entry">
          <small>{copy.socialSelf}</small>
          <Link className="secondary-action" to={profileUrl}>{copy.socialOwnProfile} ↗</Link>
        </div>
      ) : (
        <SocialActions key={authToken + '/' + creator.handle} handle={creator.handle} authToken={authToken} copy={copy} />
      ))}
    </article>
  )
}

export default CreatorDirectoryCard
