const communityLinks = [
  { key: 'enter', href: '/community', variant: 'primary' },
  { key: 'discussion', href: '/community', variant: 'secondary' },
  { key: 'share', href: '/community', variant: 'secondary' },
]

const Community = ({ copy }) => {
  return (
    <section id="community" className="c-space my-24 scroll-mt-24">
      <div className="section-heading">
        <p className="section-kicker">{copy.communityKicker}</p>
        <h2 className="text-heading">{copy.communityTitle}</h2>
        <p>{copy.communityEntryIntro}</p>
      </div>

      <div className="community-entry-card">
        <div className="community-entry-copy">
          <h3>{copy.communityEntryHeading}</h3>
          <p>{copy.communityEntryBody}</p>
          <div className="community-entry-actions">
            {communityLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className={link.variant === 'primary' ? 'primary-action' : 'secondary-action'}
              >
                {copy[`communityEntry${link.key[0].toUpperCase()}${link.key.slice(1)}`]}
              </a>
            ))}
          </div>
        </div>

        <ul className="community-entry-highlights">
          <li>
            <strong>{copy.communityEntryHighlightDiscussTitle}</strong>
            <span>{copy.communityEntryHighlightDiscussBody}</span>
          </li>
          <li>
            <strong>{copy.communityEntryHighlightCommentTitle}</strong>
            <span>{copy.communityEntryHighlightCommentBody}</span>
          </li>
          <li>
            <strong>{copy.communityEntryHighlightShareTitle}</strong>
            <span>{copy.communityEntryHighlightShareBody}</span>
          </li>
        </ul>
      </div>
    </section>
  )
}

export default Community
