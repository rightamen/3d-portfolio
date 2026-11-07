import CreatorGalaxy from './CreatorGalaxy'
import { useCountUp } from '../lib/admin/motion'
import { useInterfaceMotion } from '../hooks/useInterfacePreferences'
import { useEffect, useRef, useState } from 'react'
import { Link,useLocation } from 'react-router-dom'
import { getCreatorAnalytics } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { localizedWorkField } from '../lib/works'

const statusKeys={draft:'worksStatusDraft',review:'worksStatusReview',published:'worksStatusPublished',hidden:'worksStatusHidden',rejected:'worksStatusRejected'}
const Metric=({label,value,index})=>{
 const motion=useInterfaceMotion();const display=useCountUp(value,{duration:motion==='soft'?350:850,enabled:motion!=='off'})
 return <article className="creator-console-metric"><span className="creator-metric-index" aria-hidden="true">0{index+1}</span><span>{label}</span><strong>{display.toLocaleString()}</strong></article>
}
const money=(item,language)=>{
  try {return new Intl.NumberFormat(language,{style:'currency',currency:item.currency.toUpperCase()}).format(item.amountCents/100)}
  catch {return item.currency.toUpperCase()+' '+(item.amountCents/100).toFixed(2)}
}

const CreatorDashboard=({authToken,copy,language})=>{
  const location=useLocation(),jumped=useRef(''),motion=useInterfaceMotion()
  const [days,setDays]=useState(30)
  const [page,setPage]=useState(1)
  const [revision,setRevision]=useState(0)
  const [loaded,setLoaded]=useState({key:'',analytics:null,pagination:{},error:null})
  const key=JSON.stringify([authToken,days,page,revision])
  useEffect(()=>{
    let current=true
    getCreatorAnalytics(authToken,{days,page}).then(payload=>{
      if(current) setLoaded({key,analytics:payload.analytics,pagination:payload.pagination,error:null})
    }).catch(error=>{if(current) setLoaded({key,analytics:null,pagination:{},error})})
    return ()=>{current=false}
  },[authToken,days,page,revision,key])
  const loading=loaded.key!==key
  const data=loading ? null : loaded.analytics
  useEffect(()=>{
    if(!data || location.hash!=='#creator-performance' || jumped.current===location.key)return undefined
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById('creator-performance')
      if(target){jumped.current=location.key;target.scrollIntoView({behavior:motion==='off'?'auto':'smooth',block:'start'});target.focus({preventScroll:true})}
    })
    return()=>cancelAnimationFrame(frame)
  },[data,location.hash,location.key,motion])
  const totals=data?.totals
  const max=Math.max(1,...(data?.series || []).flatMap(day=>[day.orders,day.downloads]))
  const title=copy.creatorDays.replace('{days}',days)
  return <section className="creator-console" aria-labelledby="creator-console-title" aria-busy={loading}>
    <header className="creator-console-heading"><div><p className="section-kicker">{copy.workspaceWelcome}</p><h2 id="creator-console-title">{copy.workspaceWelcomeTitle}</h2><p>{copy.creatorConsoleIntro}</p></div><span className="creator-private-tag">◈ {copy.creatorPrivate}</span></header>
    <div className="creator-console-toolbar"><div><Link className="primary-action" to="/account/works">{copy.creatorPublish} ↗</Link><Link className="secondary-action" to="/account/favorites">{copy.accountNavFavorites}</Link></div><button className="creator-text-button" type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>↻ {copy.creatorRefresh}</button></div>
    {loading ? <div className="creator-console-loading" role="status">{copy.loading}</div> : loaded.error ? <div className="creator-console-empty" role="alert"><p>{getApiErrorMessage(loaded.error,copy,copy.creatorLoadError)}</p><button className="secondary-action" type="button" onClick={()=>setRevision(value=>value+1)}>{copy.favoriteRetry}</button></div> : data && <>
      <div className="creator-console-section-label"><span>{copy.creatorLifetime}</span><small>{copy.creatorUpdated} {new Date(data.generatedAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'})}</small></div>
      <p className="creator-console-note creator-metrics-note">{copy.creatorMetricsNote}</p>
      <div className="creator-console-metrics">{[
        [copy.creatorWorks,totals.works],[copy.creatorFavorites,totals.favorites],
        [copy.creatorDownloads,totals.downloads],[copy.creatorPaid,totals.paid],
      ].map(([label,value],index)=><Metric key={label} label={label} value={value} index={index} />)}</div>
      <CreatorGalaxy totals={totals} copy={copy} />
      <div className="creator-console-support">
        <section className="creator-console-panel creator-revenue"><p className="section-kicker">{copy.creatorRevenue}</p><div className="creator-revenue-values">{data.revenue.length ? data.revenue.map(item=><strong key={item.currency}>{money(item,language)}<small>{item.currency.toUpperCase()}</small></strong>) : <p>{copy.creatorRevenueEmpty}</p>}</div><p className="creator-console-note">{copy.creatorRevenueNote}</p><Link className="creator-pending-link" to="/account/selling">{copy.creatorPending}<strong>{totals.pending}</strong><span aria-hidden="true">↗</span></Link></section>
        <section className="creator-console-panel"><p className="section-kicker">{copy.creatorLifetime}</p><dl className="creator-engagement">{[[copy.creatorLikes,totals.likes],[copy.creatorComments,totals.comments],[copy.creatorRatings,totals.ratings],[copy.creatorRecommendations,totals.recommendations]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl><div className="creator-status-summary"><span>{copy.worksStatusPublished} <b>{totals.published}</b></span><span>{copy.worksStatusDraft} <b>{totals.drafts}</b></span><span>{copy.worksStatusReview} <b>{totals.review}</b></span><span>{copy.creatorUnavailable} <b>{totals.offline}</b></span></div></section>
      </div>
      <section className="creator-console-panel creator-trend" aria-labelledby="creator-trend-title"><header><div><h3 id="creator-trend-title">{copy.creatorTrend}</h3><p className="creator-console-note">{copy.creatorTrendNote}</p></div><select aria-label={copy.creatorTrend} value={days} onChange={event=>{setDays(Number(event.target.value));setPage(1)}}>{[7,30,90].map(value=><option key={value} value={value}>{copy.creatorDays.replace('{days}',value)}</option>)}</select></header>
        <div className="creator-chart-legend"><span><i />{copy.creatorOrders}</span><span><i />{copy.creatorDownloads}</span><small>{title}</small></div>
        <div className="creator-chart" aria-hidden="true">{data.series.map(day=><div className="creator-chart-day" key={day.date} title={day.date+' · '+copy.creatorOrders+': '+day.orders+' · '+copy.creatorDownloads+': '+day.downloads}><i style={{height:(day.orders/max*100)+'%'}} /><i style={{height:(day.downloads/max*100)+'%'}} /></div>)}</div>
        <div className="creator-chart-axis" aria-hidden="true"><span>{data.series[0]?.date}</span><span>UTC</span><span>{data.series.at(-1)?.date}</span></div>
        <details className="creator-daily-details"><summary>{copy.creatorDaily}</summary><div className="creator-console-table-scroll"><table><caption>{title} · UTC</caption><thead><tr><th>{copy.creatorDate}</th><th>{copy.creatorOrders}</th><th>{copy.creatorDownloads}</th></tr></thead><tbody>{data.series.map(day=><tr key={day.date}><th scope="row">{day.date}</th><td>{day.orders}</td><td>{day.downloads}</td></tr>)}</tbody></table></div></details>
      </section>
      <section id="creator-performance" tabIndex={-1} className="creator-console-panel creator-performance"><header><div><h3>{copy.creatorPerformance}</h3><p className="creator-console-note">{copy.creatorPerformanceNote}</p></div><Link className="creator-text-button" to="/account/works">{copy.creatorPublish} ↗</Link></header>
        {data.works.length ? <><div className="creator-console-table-scroll" role="region" aria-label={copy.creatorPerformance} tabIndex={0}><table><thead><tr><th>{copy.creatorWork}</th><th>{copy.creatorStatus}</th><th>{copy.creatorFavorites}</th><th>{copy.creatorDownloads}</th><th>{copy.creatorLikes}</th><th>{copy.creatorComments}</th><th>{copy.creatorPaid}</th></tr></thead><tbody>{data.works.map(work=><tr key={work.id}><th scope="row"><Link className="creator-performance-work" to={work.url}>{work.thumbnail || work.image ? <img loading="lazy" alt="" src={work.thumbnail || work.image} /> : <span aria-hidden="true">◇</span>}<span>{localizedWorkField(work,'title',language)}</span></Link></th><td><span className={'creator-work-status status-'+work.status}>{copy[statusKeys[work.status]] || work.status}</span></td><td>{work.metrics.favorites}</td><td>{work.metrics.downloads}</td><td>{work.metrics.likes}</td><td>{work.metrics.comments}</td><td>{work.metrics.paid}</td></tr>)}</tbody></table></div><nav className="creator-console-pagination" aria-label={copy.creatorPerformance}><p>{copy.creatorPage.replace('{page}',page).replace('{total}',loaded.pagination.total)}</p><div><button className="secondary-action" type="button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>{copy.creatorPrevious}</button><button className="secondary-action" type="button" disabled={!loaded.pagination.hasNext} onClick={()=>setPage(value=>value+1)}>{copy.creatorNext}</button></div></nav></> : <div className="creator-console-empty"><span aria-hidden="true">↗</span><h3>{copy.creatorNoWorks}</h3><p>{copy.creatorNoWorksBody}</p><Link className="primary-action" to="/account/works">{copy.creatorPublish}</Link></div>}
      </section>
    </>}
  </section>
}
export default CreatorDashboard
