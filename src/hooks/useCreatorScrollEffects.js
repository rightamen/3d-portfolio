import { readInterfaceMotion,readInterfaceEffects } from './useInterfacePreferences'
import { useEffect } from 'react'

const revealSelector = '.creator-gallery-heading, .creator-gallery-filters, .profile-activity-preview, .creator-notices li, .creator-profile-about, .creator-profile-highlights > article, .creator-profile-skills, .timeline-item, .contact-panel, .public-profile-item, .public-profile-about > article, .admin-row'
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Progressive decoration only: content is visible without an observer or an
// animation. Scroll events request a single paint, never a permanent RAF loop.
export const useCreatorScrollEffects = (pageRef, enabled) => {
  useEffect(() => {
    const page = pageRef.current
    if (!enabled || !page) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const isReduced = () => reduced.matches || readInterfaceMotion()==='off'
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const known = new WeakSet()
    const animations = new Map()
    const pending = new Set()
    let frame = 0
    let observer
    const cancelAnimations = () => {
      animations.forEach(animation => animation.cancel())
      animations.clear()
    }
    const enter = node => {
      if (node.dataset.scrollReveal === 'entered') return
      node.dataset.scrollReveal = 'entered'
      pending.delete(node)
      observer?.unobserve(node)
      if (isReduced() || document.hidden || typeof node.animate !== 'function') return
      const animation = node.animate([
        { opacity: .3, transform: 'translate3d(0,' + (finePointer.matches ? 18 : 8) + 'px,0)' },
        { opacity: 1, transform: 'none' },
      ], { duration: readInterfaceMotion()==='soft'?320:650, easing: 'cubic-bezier(.2,.7,.2,1)' })
      animations.set(node, animation)
      animation.onfinish = () => animations.delete(node)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) enter(entry.target) })
      }, { threshold: .08, rootMargin: '0px 0px -24px 0px' })
    }
    const discover = () => {
      page.querySelectorAll(revealSelector).forEach(node => {
        if (known.has(node)) return
        known.add(node)
        node.dataset.scrollReveal = 'waiting'
        if (isReduced() || !observer) enter(node)
        else { pending.add(node); observer.observe(node) }
      })
      pending.forEach(node => { if (!node.isConnected) { observer?.unobserve(node); pending.delete(node) } })
      // Removed cards need no pending animation after a tab/filter change.
      animations.forEach((animation, node) => {
        if (!node.isConnected) { animation.cancel(); animations.delete(node) }
      })
    }
    const paint = () => {
      frame = 0
      const bounds = page.getBoundingClientRect()
      const headerHeight = document.querySelector('.topbar')?.getBoundingClientRect().height || 0
      const banner = page.querySelector('.public-profile-banner')
      const bannerBounds = banner?.getBoundingClientRect()
      const nav = page.querySelector('.public-profile-tabs')
      const navTop = nav?.getBoundingClientRect().top
      const distance = Math.max(1, page.scrollHeight - (window.innerHeight - headerHeight))
      const progress = clamp((headerHeight - bounds.top) / distance, 0, 1)
      page.style.setProperty('--profile-nav-offset', headerHeight + 'px')
      page.style.setProperty('--profile-progress', progress.toFixed(4))
      page.dataset.scrolled = bounds.top < -480 && bounds.bottom > headerHeight ? 'true' : 'false'
      page.dataset.navStuck = navTop <= headerHeight + 1 && bounds.top < 0 ? 'true' : 'false'
      page.dataset.scrollMotion = isReduced() ? 'reduced' : 'full'
      if (banner) {
        const active = !isReduced() && readInterfaceEffects() && finePointer.matches && bannerBounds.bottom > headerHeight && bannerBounds.top < window.innerHeight
        banner.style.setProperty('--profile-parallax', (active ? clamp((headerHeight - bannerBounds.top) * .12, 0, 24) : 0).toFixed(2) + 'px')
      }
    }
    const schedule = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(paint) }
    const preferenceChange = () => {
      if (isReduced()) {
        cancelAnimations()
        page.querySelectorAll(revealSelector).forEach(enter)
      }
      schedule()
    }
    const focus = event => {
      // Tab navigation must never land on a fading or displaced control.
      for (let node = event.target; node && node !== page; node = node.parentElement) {
        if (node.dataset.scrollReveal) {
          enter(node)
          animations.get(node)?.cancel()
          animations.delete(node)
        }
      }
    }
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; cancelAnimations() }
      else schedule()
    }
    const mutations = new MutationObserver(() => { discover(); schedule() })
    mutations.observe(page, { childList: true, subtree: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(page)
    const header = document.querySelector('.topbar')
    if (header) resize.observe(header)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('mrright-interface-change', preferenceChange)
    reduced.addEventListener('change', preferenceChange)
    finePointer.addEventListener('change', preferenceChange)
    document.addEventListener('visibilitychange', visibility)
    page.addEventListener('focusin', focus)
    discover()
    paint()
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimations()
      observer?.disconnect()
      pending.clear()
      mutations.disconnect()
      resize.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('mrright-interface-change', preferenceChange)
      reduced.removeEventListener('change', preferenceChange)
      finePointer.removeEventListener('change', preferenceChange)
      document.removeEventListener('visibilitychange', visibility)
      page.removeEventListener('focusin', focus)
      page.querySelectorAll('[data-scroll-reveal]').forEach(node => delete node.dataset.scrollReveal)
      page.querySelector('.public-profile-banner')?.style.removeProperty('--profile-parallax')
      for (const key of ['--profile-nav-offset', '--profile-progress']) page.style.removeProperty(key)
      for (const key of ['scrolled', 'navStuck', 'scrollMotion']) delete page.dataset[key]
    }
  }, [enabled, pageRef])
}
