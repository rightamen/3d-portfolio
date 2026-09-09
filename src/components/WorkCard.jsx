import { Link } from 'react-router-dom'

import { initials } from '../lib/initials'
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
  const creator = work.creator || {}
  const creatorName = creator.displayName || `@${creator.handle || ''}`

  // The avatar and the name are one target, so the face is clickable rather
  // than decoration beside a link. The name labels the link, which is why the
  // image is alt="" -- announcing it would read the creator's name twice.
  const creatorBody = (
    <>
      {creator.avatarUrl ? (
        <img alt="" className="work-tile-avatar" decoding="async" loading="lazy" src={creator.avatarUrl} />
      ) : (
        <span className="work-tile-avatar">{initials(creator.displayName, creator.handle)}</span>
      )}
      <span className="work-tile-creator-name">{creatorName}</span>
    </>
  )

  return (
    <article className="work-tile">
      <Link className="work-tile-media" to={work.url}>
        {/* The thumbnail, falling back to the full cover for rows that predate
            thumbnails. A grid pulling full-size covers is how four tiles came
            to weigh 15.31MB -- the tiles were not empty, the pictures had not
            arrived. */}
        {work.thumbnail || work.image ? (
          <img alt="" decoding="async" loading="lazy" src={work.thumbnail || work.image} />
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
        {showCreator && creator.handle ? (
          // Only a link when the profile is actually readable -- profilePublic
          // folds in both the visitor's own setting and a moderator's disable.
          // Sending someone to "this profile is private" is a dead end, and a
          // tile should not spend a click on one.
          creator.profilePublic ? (
            <Link className="work-tile-creator" to={`/u/${creator.handle}`}>
              {creatorBody}
            </Link>
          ) : (
            <span className="work-tile-creator">{creatorBody}</span>
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
