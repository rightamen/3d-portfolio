// Writing the About / Toolkit / Timeline that a profile renders.
//
// Until this there was no way to write them at all: they were the site owner's,
// out of content.js, and every other creator got a 300-character bio. This is
// the editor for the same blocks, for everyone.
//
// It edits a draft held by the settings form and saved with the rest of the
// profile, rather than saving each row on its own. One Save for one screen is
// what the surrounding form already promises, and a row that saves itself while
// the fields above it are still unsaved is a screen where nobody can tell what
// is stored.

const LIMITS = {
  about: 2000,
  experienceBody: 400,
  experiencePeriod: 40,
  experienceTitle: 80,
  highlightBody: 240,
  highlightTitle: 60,
  highlights: 6,
  skill: 40,
  skills: 24,
  timeline: 12,
}

// The counter is not decoration: the server truncates silently, so a creator who
// cannot see the limit finds out by having their last sentence disappear.
const Counter = ({ max, value }) => (
  <small className={value.length > max * 0.9 ? 'text-coral' : ''}>
    {value.length} / {max}
  </small>
)

const CreatorProfileEditor = ({ copy, onChange, value }) => {
  const about = value.about || ''
  const highlights = value.highlights || []
  const skills = value.skills || []
  const experience = value.experience || []

  const patch = (changes) => onChange({ ...value, ...changes })

  const updateAt = (list, index, changes) =>
    list.map((item, current) => (current === index ? { ...item, ...changes } : item))

  return (
    <div className="creator-editor">
      <label className="field-label">
        {copy.creatorEditorAbout}
        <textarea
          className="field-input field-input-focus"
          maxLength={LIMITS.about}
          onChange={(event) => patch({ about: event.target.value })}
          placeholder={copy.creatorEditorAboutHint}
          rows={6}
          value={about}
        />
        <Counter max={LIMITS.about} value={about} />
      </label>

      <div className="creator-editor-section">
        <div className="creator-editor-head">
          <span className="field-label">{copy.creatorEditorHighlights}</span>
          <button
            className="secondary-action"
            disabled={highlights.length >= LIMITS.highlights}
            onClick={() => patch({ highlights: [...highlights, { body: '', title: '' }] })}
            type="button"
          >
            {copy.creatorEditorAdd}
          </button>
        </div>
        <p className="account-section-intro">{copy.creatorEditorHighlightsHint}</p>

        {highlights.map((item, index) => (
          <div className="creator-editor-row" key={index}>
            <input
              className="field-input field-input-focus"
              maxLength={LIMITS.highlightTitle}
              onChange={(event) =>
                patch({ highlights: updateAt(highlights, index, { title: event.target.value }) })
              }
              placeholder={copy.creatorEditorHighlightTitle}
              type="text"
              value={item.title || ''}
            />
            <textarea
              className="field-input field-input-focus"
              maxLength={LIMITS.highlightBody}
              onChange={(event) =>
                patch({ highlights: updateAt(highlights, index, { body: event.target.value }) })
              }
              placeholder={copy.creatorEditorHighlightBody}
              rows={2}
              value={item.body || ''}
            />
            <button
              className="danger-action"
              onClick={() => patch({ highlights: highlights.filter((_, i) => i !== index) })}
              type="button"
            >
              {copy.creatorEditorRemove}
            </button>
          </div>
        ))}
      </div>

      <div className="creator-editor-section">
        <span className="field-label">{copy.creatorEditorSkills}</span>
        <p className="account-section-intro">{copy.creatorEditorSkillsHint}</p>
        {/* One field, comma-separated, rather than a row per tool: a toolkit is
            a list somebody types in one go, and twenty "add" clicks to enter it
            is a form nobody finishes. Split on save, joined on load. */}
        <input
          className="field-input field-input-focus"
          onChange={(event) =>
            patch({
              skills: event.target.value
                .split(/[,，]/)
                .map((item) => item.trim().slice(0, LIMITS.skill))
                .filter(Boolean)
                .slice(0, LIMITS.skills),
            })
          }
          placeholder={copy.creatorEditorSkillsPlaceholder}
          type="text"
          value={skills.join(', ')}
        />
        <small>
          {skills.length} / {LIMITS.skills}
        </small>
      </div>

      <div className="creator-editor-section">
        <div className="creator-editor-head">
          <span className="field-label">{copy.creatorEditorExperience}</span>
          <button
            className="secondary-action"
            disabled={experience.length >= LIMITS.timeline}
            onClick={() =>
              patch({ experience: [...experience, { body: '', period: '', title: '' }] })
            }
            type="button"
          >
            {copy.creatorEditorAdd}
          </button>
        </div>
        <p className="account-section-intro">{copy.creatorEditorExperienceHint}</p>

        {experience.map((item, index) => (
          <div className="creator-editor-row" key={index}>
            <input
              className="field-input field-input-focus"
              maxLength={LIMITS.experiencePeriod}
              onChange={(event) =>
                patch({ experience: updateAt(experience, index, { period: event.target.value }) })
              }
              placeholder={copy.creatorEditorExperiencePeriod}
              type="text"
              value={item.period || ''}
            />
            <input
              className="field-input field-input-focus"
              maxLength={LIMITS.experienceTitle}
              onChange={(event) =>
                patch({ experience: updateAt(experience, index, { title: event.target.value }) })
              }
              placeholder={copy.creatorEditorExperienceTitle}
              type="text"
              value={item.title || ''}
            />
            <textarea
              className="field-input field-input-focus"
              maxLength={LIMITS.experienceBody}
              onChange={(event) =>
                patch({ experience: updateAt(experience, index, { body: event.target.value }) })
              }
              placeholder={copy.creatorEditorExperienceBody}
              rows={2}
              value={item.body || ''}
            />
            <button
              className="danger-action"
              onClick={() => patch({ experience: experience.filter((_, i) => i !== index) })}
              type="button"
            >
              {copy.creatorEditorRemove}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CreatorProfileEditor
