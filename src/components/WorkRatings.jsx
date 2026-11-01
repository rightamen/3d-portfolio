import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkRating, saveWorkRating } from '../lib/api'

const WorkRatings = ({ work, handle, slug, authToken, visitorUser, copy }) => {
  const [loaded, setLoaded] = useState(null)
  const [status, setStatus] = useState('loading')
  const [nonce, setNonce] = useState(0)
  const [score, setScore] = useState(0)
  const [recommended, setRecommended] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    getWorkRating(handle, slug, authToken).then(payload => {
      if (cancelled) return
      setLoaded(payload); setScore(payload.mine?.score || 0); setRecommended(payload.mine?.recommended === true); setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [authToken, handle, nonce, slug])
  const ratings = loaded?.ratings || work.ratings || { count: 0, average: 0, recommendations: 0 }
  const owner = visitorUser?.id === work.creator?.id
  const stale = status === 'ready' && loaded?.contentVersion !== work.contentVersion
  const allowed = !stale && authToken && visitorUser?.emailVerified && !owner && status === 'ready'
  const submit = async (event) => {
    event.preventDefault()
    if (!allowed || saving || !score) return
    setSaving(true); setMessage('')
    try {
      const payload = await saveWorkRating(handle, slug, { score, recommended, version: work.contentVersion }, authToken)
      setLoaded(payload); setMessage(copy.ratingSaved)
    } catch (error) {
      setMessage(error.status === 409 ? copy.ratingStale : copy.ratingSaveError)
      if (error.status === 409) { setStatus('loading'); setNonce(value => value + 1) }
    }
    finally { setSaving(false) }
  }
  return <section className="work-ratings" aria-label={copy.ratingTitle}>
    <div className="work-ratings-heading"><h2>{copy.ratingTitle}</h2><p>{ratings.count ? copy.ratingSummary.replace('{average}', Number(ratings.average).toFixed(1)).replace('{count}', ratings.count).replace('{recommendations}', ratings.recommendations) : copy.ratingNone}</p></div>
    <p className="work-rating-rule">{copy.ratingRule}</p>
    {stale && <p role="status">{copy.ratingStale}</p>}
    {status === 'loading' && <p role="status">{copy.loading}</p>}
    {status === 'error' && <div><p role="alert">{copy.ratingLoadError}</p><button type="button" className="secondary-action" onClick={() => { setStatus('loading'); setNonce(value => value + 1) }}>{copy.ratingRetry}</button></div>}
    {!authToken ? <Link className="secondary-action" to="/login?mode=login">{copy.ratingSignIn}</Link> : owner ? <p>{copy.ratingOwner}</p> : !visitorUser?.emailVerified ? <p>{copy.ratingVerify}</p> : <form onSubmit={submit}>
      <fieldset disabled={!allowed || saving}><legend>{copy.ratingLabel}</legend><div className="work-rating-stars">
        {[1,2,3,4,5].map(value => <label key={value} className={value <= score ? 'is-rated' : ''}><input type="radio" name="work-rating" value={value} checked={score === value} aria-label={copy.ratingStars.replace('{score}', value)} onChange={() => { setScore(value); if (value < 4) setRecommended(false) }} /><span aria-hidden="true">★</span></label>)}
      </div>
      <label className="work-rating-recommend"><input type="checkbox" checked={recommended} disabled={score < 4} onChange={event => setRecommended(event.target.checked)} />{copy.ratingRecommend}</label>
      <button className="primary-action" type="submit" disabled={!score || saving}>{saving ? copy.loading : copy.ratingSave}</button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>
}
export default WorkRatings
