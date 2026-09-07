import { Link } from 'react-router-dom'

import { assetCategoryLabel, formatWorkPrice, localizedWorkField } from '../lib/works'

// One work, as a card. Shared by /explore and by a creator's profile: the two
// grids show the same thing and there is no reason for them to drift apart,
// which two copies of this would eventually do.

const WorkCard = ({ copy, language, showCreator = true, work }) => (
  <article className="explore-card">
    <Link className="explore-card-media" to={work.url}>
      {work.image ? (
        <img alt="" decoding="async" loading="lazy" src={work.image} />
      ) : (
        <span className="explore-card-placeholder" />
      )}
    </Link>
    <div className="explore-card-body">
      <h3>
        <Link to={work.url}>{localizedWorkField(work, 'title', language)}</Link>
      </h3>
      <p>{localizedWorkField(work, 'summary', language)}</p>
      <div className="explore-card-meta">
        {/* Off on a creator's own profile: every card there has the same
            author, and repeating it once per card is noise. */}
        {showCreator && work.creator?.handle ? (
          // Only a link when the profile is actually readable. The server
          // decides that -- profilePublic folds in both the visitor's own
          // setting and a moderator's disable -- because sending someone to a
          // page that says "this profile is private" is a dead end, and a
          // card should not spend a click on one.
          work.creator.profilePublic ? (
            <Link className="explore-card-creator" to={`/u/${work.creator.handle}`}>
              {copy.exploreBy} {work.creator.displayName || `@${work.creator.handle}`}
            </Link>
          ) : (
            <span className="explore-card-creator">
              {copy.exploreBy} {work.creator.displayName || `@${work.creator.handle}`}
            </span>
          )
        ) : (
          <span className="explore-card-creator">
            {assetCategoryLabel(work.assetCategory, language)}
          </span>
        )}
        <span className="explore-card-price">{formatWorkPrice(work, copy)}</span>
      </div>
    </div>
  </article>
)

export default WorkCard
