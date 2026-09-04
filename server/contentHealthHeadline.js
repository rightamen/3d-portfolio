// The content-health finding counts, cached, so the dashboard can badge them.
//
// This exists because of open item 4, which was open on purpose. The admin
// sidebar wanted a badge on Content Health when something is critical, and the
// check that produces that number opens every file the catalogue points at --
// while /api/admin/overview, the one request the badge could ride along on, is
// fetched every single time the dashboard opens. Folding the check into that
// handler would have traded a silent problem for a slow console, which is why
// the badge was withheld rather than built.
//
// So the counts live here, behind two rules:
//
//   1. TTL, not mtime. server/index.js caches the built index.html against a
//      single mtime because there is exactly one file to stat. This check
//      spans dist/, public/uploads/ and the project list in the database --
//      there is no one file whose mtime answers "is this stale", and stat-ing
//      them all is the filesystem work the cache exists to avoid. So it
//      follows sitemapCache / communityListCache instead: a plain expiry,
//      refreshed on demand.
//
//   2. read() never blocks the caller and never awaits. It is synchronous by
//      design, not by accident: a cold cache answers `null` and *starts* the
//      refresh, so the overview responds at its usual speed, the badge simply
//      does not render, and the next dashboard load has the number. A
//      dashboard that waits on file I/O to decide whether to draw a badge is
//      exactly the problem this item was left open over -- returning null is
//      the feature, not a degraded path.
//
// A stale value is served the same way, for the same reason: the caller gets
// the last known counts immediately while the refresh runs behind it. The
// numbers are a nudge to go look at the detail view, and a five-minute-old
// nudge is worth incomparably more than a fast page made slow.

const DEFAULT_TTL_MS = 5 * 60 * 1000

export const createContentHealthHeadline = ({
  collect,
  now = Date.now,
  onError = () => {},
  ttlMs = DEFAULT_TTL_MS,
}) => {
  // The last successful collect, or null until one lands.
  let headline = null
  // One gate for both outcomes. A failed or empty collect backs off by the
  // same TTL rather than re-running the whole filesystem sweep on every
  // dashboard load for as long as the failure lasts.
  let refreshAfter = 0
  // Single-flight: several admins, or one admin refreshing repeatedly, must
  // not start several concurrent sweeps of the same files.
  let inFlight = null

  const refresh = () => {
    if (inFlight) return inFlight

    inFlight = (async () => {
      try {
        const next = await collect()
        // A collect that has nothing to report (no admin store configured, for
        // instance) leaves the previous value alone rather than blanking it.
        if (next) headline = next
        return next || null
      } catch (error) {
        // A broken check must not take the dashboard with it, and must not
        // reject: nothing awaits this promise on the request path, so an
        // escaping rejection would surface as an unhandled rejection rather
        // than as a log line.
        onError(error)
        return null
      } finally {
        refreshAfter = now() + ttlMs
        inFlight = null
      }
    })()

    return inFlight
  }

  return {
    // Synchronous on purpose -- see the header. Returns the cached counts, or
    // null when nothing has been collected yet, and schedules a refresh when
    // the value is missing or past its TTL.
    read: () => {
      if (now() >= refreshAfter) refresh()
      return headline
    },
    // For callers that genuinely want to wait (a warm-up at boot, a test).
    // Nothing on the request path may use this.
    refresh,
  }
}
