import { Link } from 'react-router-dom'

import { assetCategoryLabel, formatWorkPrice, localizedWorkField } from '../lib/works'

// One work, as a tile. Shared by /explore, a creator's profile and the
// homepage catalogue: the three grids show the same thing and there is no
// reason for them to drift apart, which three copies of this would.
//
// Image-first, in the shape a browsing art site uses: the tile IS the artwork,
// and the title, author and price ride over it. The summary is gone --
// scanning a grid is looking at pictures, and a paragraph under each one is
// what made this a store listing rather than a portfolio.
//
// ⚠️ The metadata overlays on HOVER only where hovering exists. On a touch
// screen there is no hover, so a title that only appears on hover is a title
// nobody on a phone ever reads; there it sits under the image instead. Same
// for keyboard users, via :focus-within. The CSS carries both.
const WorkCard = ({ copy, language, showCreator = true, work }) => {
  const creatorName = work.creator?.displayName || `@${work.creator?.handle || ''}`

  return (
    <article className="work-tile">
      <Link className="work-tile-media" to={work.url}>
        {work.image ? (
          <img alt="" decoding="async" loading="lazy" src={work.image} />
        ) : (
          <span className="work-tile-placeholder" />
        )}
        {/* A badge on the image, not a row beneath it: price is something you
            check while scanning, not after committing to a tile. */}
        <span className="work-tile-price">{formatWorkPrice(work, copy)}</span>
      </Link>

      <div className="work-tile-meta">
        <h3>
          <Link to={work.url}>{localizedWorkField(work, 'title', language)}</Link>
        </h3>
        {showCreator && work.creator?.handle ? (
          // Only a link when the profile is actually readable -- profilePublic
          // folds in both the visitor's own setting and a moderator's disable.
          // Sending someone to "this profile is private" is a dead end, and a
          // tile should not spend a click on one.
          work.creator.profilePublic ? (
            <Link className="work-tile-creator" to={`/u/${work.creator.handle}`}>
              {creatorName}
            </Link>
          ) : (
            <span className="work-tile-creator">{creatorName}</span>
          )
        ) : (
          <span className="work-tile-creator">
            {assetCategoryLabel(work.assetCategory, language)}
          </span>
        )}
      </div>
    </article>
  )
}

export default WorkCard
