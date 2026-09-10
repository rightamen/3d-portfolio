// A creator's own About / Toolkit / Timeline, on their profile.
//
// These blocks used to be the site owner's only: they came from content.js,
// were rendered behind an `isSiteOwner` check, and nobody else had them -- a
// 300-character bio was the whole of what another creator could say about
// themselves on a site that asks them to sell their work.
//
// One renderer for everyone, driven by what the creator wrote. Each part is
// rendered only when it has something in it, so a profile nobody has filled in
// shows nothing at all rather than a column of empty headings.
const CreatorProfileContent = ({ content, copy, displayName }) => {
  if (!content) return null

  const { about, experience = [], highlights = [], skills = [] } = content
  if (!about && highlights.length === 0 && skills.length === 0 && experience.length === 0) {
    return null
  }

  return (
    <section className="owner-section creator-profile-content">
      <p className="section-kicker">{copy.creatorAboutKicker}</p>
      <h2>{copy.creatorAboutTitle}</h2>

      <div className="creator-profile-grid">
        {about && (
          <article className="creator-profile-about">
            <h3>{copy.creatorAboutIntro.replace('{name}', displayName || '')}</h3>
            {/* Split rather than dangerouslySetInnerHTML: the text is written by
                a stranger and rendered on a public page, so it stays text. The
                blank-line split is what turns their paragraphs back into
                paragraphs after the server stored them as plain text. */}
            {about.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </article>
        )}

        {highlights.length > 0 && (
          <div className="creator-profile-highlights">
            {highlights.map((item) => (
              <article key={item.title || item.body}>
                {item.title && <h3>{item.title}</h3>}
                {item.body && <p>{item.body}</p>}
              </article>
            ))}
          </div>
        )}
      </div>

      {skills.length > 0 && (
        <div className="creator-profile-skills">
          <h3>{copy.creatorAboutToolkit}</h3>
          <div>
            {skills.map((skill) => (
              <span className="skill-pill" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div className="creator-profile-timeline">
          <h3>{copy.creatorAboutExperience}</h3>
          <div className="timeline-panel">
            {experience.map((item, index) => (
              <article className="timeline-item" key={`${item.period}-${item.title}-${index}`}>
                {item.period && <span>{item.period}</span>}
                {item.title && <h4>{item.title}</h4>}
                {item.body && <p>{item.body}</p>}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default CreatorProfileContent
