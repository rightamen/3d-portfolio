import {getCopy} from '../../lib/i18n'
import {resourceTypes,resourceLabels} from '../../lib/resources'
import { useEffect, useState } from 'react'
import { getAdminWorks, saveAdminCuration } from '../../lib/api'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { localizedWorkField } from '../../lib/works'
import { EXHIBITION_MIN_SCORE, exhibitionSources } from '../../../server/exhibition.js'

const CurationForm = ({ work, onSave }) => {
  const { language, t } = useAdminI18n()
  const copy=getCopy(language)
  const [score, setScore] = useState(work.curation?.score ?? '')
  const [recommended, setRecommended] = useState(work.curation?.recommended === true)
  const [status, setStatus] = useState('')
  const sources = exhibitionSources(work)
  const canRecommend = work.status === 'published' && score !== '' && Number(score) >= EXHIBITION_MIN_SCORE
  const submit = async (event) => {
    event.preventDefault()
    if (status === 'saving') return
    setStatus('saving')
    try {
      await onSave(work.id, { score: score === '' ? null : Number(score), recommended: canRecommend && recommended, version: work.contentVersion })
      setStatus('saved')
    } catch (error) { setStatus(error.status === 409 ? 'stale' : 'error') }
  }
  return <article className="admin-curation-work">
    <div className="admin-curation-work-head">
      {work.thumbnail || work.image ? <img src={work.thumbnail || work.image} alt="" loading="lazy" /> : null}
      <div><a href={work.url} target="_blank" rel="noreferrer">{localizedWorkField(work, 'title', language)} ↗</a><small>@{work.creator?.handle} · {resourceLabels(copy)[work.resourceType || 'model']}</small>
      <p>{sources.curator || sources.community ? t('curation.exhibiting') : t('curation.notExhibiting')}</p>
      <small>{t('curation.communityStats', { average: Number(work.ratings?.average || 0).toFixed(1), count: work.ratings?.count || 0, recommendations: work.ratings?.recommendations || 0 })}</small></div>
    </div>
    <form onSubmit={submit}>
      <label>{t('curation.score')}<input className="field-input" type="number" min="0" max="100" step="1" value={score} onChange={event => { setScore(event.target.value); if (Number(event.target.value) < EXHIBITION_MIN_SCORE || event.target.value === '') setRecommended(false) }} disabled={status === 'saving'} /></label>
      <label className="admin-curation-check"><input type="checkbox" checked={recommended} disabled={!canRecommend || status === 'saving'} onChange={event => setRecommended(event.target.checked)} />{t('curation.recommend')}</label>
      <button type="submit" className="primary-action" disabled={status === 'saving'}>{status === 'saving' ? t('common.working') : t('curation.save')}</button>
      {status && status !== 'saving' && <span role={status === 'saved' ? 'status' : 'alert'}>{status === 'saved' ? t('curation.saved') : status === 'stale' ? t('curation.stale') : t('curation.saveError')}</span>}
    </form>
  </article>
}

const AdminCurationSection = ({ token }) => {
  const { t,language } = useAdminI18n()
  const copy=getCopy(language),labels=resourceLabels(copy)
  const [resourceType,setResourceType]=useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('published')
  const [nonce, setNonce] = useState(0)
  const [loaded, setLoaded] = useState({ key: '', works: [], pagination: {}, error: false })
  const key = JSON.stringify([token, page, filter, resourceType, nonce])
  useEffect(() => {
    let cancelled = false
    getAdminWorks(token, { page, status: filter,resourceType }).then(payload => {
      if (!cancelled) setLoaded({ key, works: payload.works || [], pagination: payload.pagination || {}, error: false })
    }).catch(() => { if (!cancelled) setLoaded({ key, works: [], pagination: {}, error: true }) })
    return () => { cancelled = true }
  }, [filter, key, nonce, page, token, resourceType])
  const save = async (id, fields) => {
    const payload = await saveAdminCuration(token, id, fields)
    setLoaded(current => current.key === key ? { ...current, works: current.works.map(work => work.id === id ? payload.work : work) } : current)
  }
  const ready = loaded.key === key
  return <section className="admin-section admin-curation-section">
    <div className="admin-section-header"><div><h2>{t('curation.title')}</h2><small>{t('curation.rules')}</small></div><button className="secondary-action" type="button" onClick={() => setNonce(value => value + 1)}>{t('common.refresh')}</button></div>
    <p>{t('curation.versionNote')}</p>
    <label>{copy.resourceFilterType}<select className="field-input" aria-label={copy.resourceFilterType} value={resourceType} onChange={e=>{setResourceType(e.target.value);setPage(1)}}><option value="">{copy.resourceAll}</option>{resourceTypes.map(type=><option key={type} value={type}>{labels[type]}</option>)}</select></label>
    <label>{t('curation.filter')}<select className="field-input" value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}><option value="published">{t('status.published')}</option><option value="">{t('curation.allStatuses')}</option></select></label>
    {!ready ? <p role="status">{t('common.loading')}</p> : loaded.error ? <p role="alert">{t('curation.loadError')}</p> : <>
      {loaded.works.length ? loaded.works.map(work => <CurationForm key={work.id + ':' + work.contentVersion + ':' + nonce} work={work} onSave={save} />) : <p>{t('curation.empty')}</p>}
      <div className="visitor-pagination"><button className="secondary-action" type="button" disabled={!loaded.pagination.hasPrevious} onClick={() => setPage(value => value - 1)}>{t('common.previous')}</button><span>{t('common.pageOf', { page: loaded.pagination.page || 1, pages: loaded.pagination.pages || 1 })}</span><button className="secondary-action" type="button" disabled={!loaded.pagination.hasNext} onClick={() => setPage(value => value + 1)}>{t('common.next')}</button></div>
    </>}
  </section>
}
export default AdminCurationSection
