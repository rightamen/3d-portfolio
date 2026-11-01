import { useEffect } from 'react'

const selectors = {
  home: '.studio-eyebrow, .atelier-heading h1, .studio-hero-description, .studio-hero-types, .studio-hero-foot, .curated-exhibition-heading, .studio-section-heading, #projects > .section-kicker, #community .section-heading, .community-feed li, .studio-footer',
  explore: '.explore-header, .publish-cta > div, .work-tile',
  work: '.work-info h1, .work-info > p, .work-specs, .work-files, .work-ratings-heading, .work-rating-rule, .work-comments-head, .work-comment-body',
  community: '.community-page-heading h1, .community-page-heading > p, .community-hero-stats, .community-list-header, .community-post-card, .community-detail-title, .community-detail-author, .community-detail-message, .community-card',
  account: '.account-studio-hero h1, .account-studio-hero p, .account-center-card, .account-section-intro, .account-channel-preview, .theme-preset',
  auth: '.auth-brand-panel h1, .auth-brand-panel p, .auth-feature-row',
}
const hoverSelector = '.work-tile-media, .community-post-card, .account-center-card, .publish-cta'

// This root follows the router, including late lazy/data content. It never
// transforms a canvas, the infinite wall, a modal or a transactional form.
export const useModuleEffects = (rootRef, kind, routeKey) => {
  useEffect(() => {
    const root = rootRef.current, selector = selectors[kind]
    if (!root || !selector) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const known = new WeakSet(), pending = new Set(), animations = new Map()
    let observer, hovered = null, frame = 0, pointer = null, active = true
    const clearHover = () => {
      cancelAnimationFrame(frame); frame = 0; pointer = null
      if (hovered) {
        delete hovered.dataset.moduleLit
        hovered.style.removeProperty('--module-light-x')
        hovered.style.removeProperty('--module-light-y')
        hovered = null
      }
    }
    const cancel = () => { animations.forEach(animation => animation.cancel()); animations.clear() }
    const enter = (node, order = 0, animate = true) => {
      if (!active || !root.contains(node) || node.dataset.moduleReveal === 'entered') return
      node.dataset.moduleReveal = 'entered'
      observer?.unobserve(node); pending.delete(node)
      if (!animate || reduced.matches || document.hidden || typeof node.animate !== 'function') return
      // Cards fade in without a transform, leaving hover and pointer geometry
      // intact. Only editorial text moves a few pixels.
      const card = node.matches('.work-tile, .community-post-card, .account-center-card, .community-card, .theme-preset, .work-comment-body')
      const animation = node.animate([
        { opacity: .35, transform: card ? 'none' : 'translate3d(0,' + (fine.matches ? 14 : 7) + 'px,0)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 580, delay: Math.min(order, 3) * 45, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })
      animations.set(node, animation)
      animation.onfinish = () => animations.delete(node)
    }
    if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => enter(entry.target, index))
    }, { threshold: .08, rootMargin: '0px 0px -20px 0px' })
    const discover = () => {
      if (!active) return
      root.querySelectorAll(selector).forEach(node => {
        if (known.has(node)) return
        known.add(node); node.dataset.moduleReveal = 'waiting'
        if (reduced.matches || !observer) enter(node, 0, false)
        else { pending.add(node); observer.observe(node) }
      })
      pending.forEach(node => { if (!node.isConnected) { observer?.unobserve(node); pending.delete(node) } })
      animations.forEach((animation, node) => { if (!node.isConnected) { animation.cancel(); animations.delete(node) } })
      if (hovered && !hovered.isConnected) clearHover()
    }
    const focus = event => {
      for (let node = event.target; node && node !== root; node = node.parentElement) {
        if (node.dataset.moduleReveal) {
          enter(node, 0, false); animations.get(node)?.cancel(); animations.delete(node)
        }
      }
    }
    const move = event => {
      if (reduced.matches || !fine.matches || event.pointerType !== 'mouse') return
      const next = event.target.closest?.(hoverSelector)
      if (!next || !root.contains(next)) { clearHover(); return }
      if (hovered !== next) { clearHover(); hovered = next }
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        if (!hovered?.isConnected || !pointer) return
        const bounds = hovered.getBoundingClientRect()
        hovered.style.setProperty('--module-light-x', (pointer.x - bounds.left).toFixed(1) + 'px')
        hovered.style.setProperty('--module-light-y', (pointer.y - bounds.top).toFixed(1) + 'px')
        hovered.dataset.moduleLit = 'true'
      })
    }
    const preference = () => {
      root.dataset.moduleMotion = reduced.matches ? 'reduced' : 'full'
      if (reduced.matches) { cancel(); root.querySelectorAll(selector).forEach(node => enter(node, 0, false)) }
      if (reduced.matches || !fine.matches) clearHover()
    }
    const visibility = () => { if (document.hidden) { cancel(); clearHover() } }
    const mutations = new MutationObserver(discover)
    mutations.observe(root, { childList: true, subtree: true })
    root.addEventListener('focusin', focus)
    root.addEventListener('pointermove', move, { passive: true })
    root.addEventListener('pointerleave', clearHover)
    window.addEventListener('scroll', clearHover, { passive: true })
    document.addEventListener('visibilitychange', visibility)
    reduced.addEventListener('change', preference)
    fine.addEventListener('change', preference)
    preference(); discover()
    return () => {
      active = false
      cancel(); clearHover(); observer?.disconnect(); mutations.disconnect(); pending.clear()
      root.removeEventListener('focusin', focus)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', clearHover)
      window.removeEventListener('scroll', clearHover)
      document.removeEventListener('visibilitychange', visibility)
      reduced.removeEventListener('change', preference)
      fine.removeEventListener('change', preference)
      root.querySelectorAll('[data-module-reveal]').forEach(node => delete node.dataset.moduleReveal)
      delete root.dataset.moduleMotion
    }
  }, [kind, rootRef, routeKey])
}
