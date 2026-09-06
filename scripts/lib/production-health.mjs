// The decision logic behind scripts/check-production.mjs, with no I/O in it.
//
// On 2026-09-04 the TLS certificate expired and every visitor got a browser
// security warning for four hours and twenty-three minutes. Nothing caught it:
// the application never threw, journalctl was clean, and /api/health answered
// 200 the whole time -- because the deploy script asks for it from inside the
// VPS, over plain HTTP, to localhost. That request never touches TLS, so the
// one thing that was broken was the one thing nothing looked at.
//
// So the rule this module is built around: a check that can only answer "did
// the app respond" is worthless here. Every function below turns an observed
// fact into a severity, and the severities are chosen from the operator's side
// of a 3am page:
//
//   fail  a visitor is being hurt right now, or will be within a week --
//         an expired or nearly-expired certificate, a handshake that does not
//         complete, a route that does not answer the way it must.
//   warn  a signal has degraded but nobody is being turned away -- a renewal
//         that has not happened yet with weeks of runway, a sitemap that lists
//         no projects, a missing structured-data graph.
//   pass  observed and correct.
//
// Only `fail` sets a non-zero exit code (see summarize). That split is what
// makes the script safe to leave under cron: warnings accumulate in the report
// without waking anyone, failures do wake someone.
//
// Everything here is pure so the boundaries can be tested without a network --
// same split as server/orphanedUploads.js + scripts/find-orphaned-uploads.mjs.
// tests/unit/production-health.spec.js is the suite.

export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

// The renewal window is roughly thirty days out, so a warning at twenty-one
// days is a renewal that should already have happened and has not -- early
// enough to be acted on during a working week, late enough not to be noise for
// the two-thirds of the certificate's life when there is nothing to do. Seven
// days is the point where "we will get to it" stops being true.
export const CERT_WARN_DAYS = 21
export const CERT_FAIL_DAYS = 7

// The site default, from server/seo.js's DEFAULT_TITLE. A project page wearing
// this title has not been given its own head -- see evaluateProjectHead.
export const SITE_DEFAULT_TITLE = 'mrright.blog | 3D Portfolio'

export const DEFAULT_BASE_URL = 'https://mrright.blog'

// The six paths CLAUDE.md requires after every deploy. The seventh, a project
// detail page, is not a constant: production's catalogue lives in the database
// and does not match the bundled content.js, so the script discovers a real
// project URL from the sitemap instead of hardcoding a slug that may have been
// renamed or deleted.
export const REQUIRED_PATHS = [
  '/api/health',
  '/',
  '/community',
  '/admin',
  '/login?mode=login',
  '/account',
]

const SEVERITY_ORDER = { pass: 0, warn: 1, fail: 2 }

// Whole days, rounded down, so a certificate with 21 days and 23 hours left
// reports 21 and warns. Rounding the other way would delay every threshold by
// up to a day, and this is not a place to be generous with itself.
export const daysRemaining = (notAfter, now) =>
  Math.floor((notAfter.getTime() - now.getTime()) / MILLISECONDS_PER_DAY)

// Accepts what tls.getPeerCertificate() actually hands back: `valid_to` is a
// string in OpenSSL's format ("Dec  3 12:00:00 2026 GMT"), which Date parses.
export const parseCertificateDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !value.trim()) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// The headline check. `notAfter` is the certificate's expiry; `now` is passed
// in rather than read from the clock so the thresholds are testable.
export const evaluateCertificate = ({
  failDays = CERT_FAIL_DAYS,
  notAfter,
  now = new Date(),
  warnDays = CERT_WARN_DAYS,
} = {}) => {
  const expiry = parseCertificateDate(notAfter)

  // A certificate whose expiry cannot be read is not a certificate that has
  // been checked. Reporting that as a pass would rebuild the exact blind spot
  // this script exists to remove.
  if (!expiry) {
    return {
      detail: 'could not read the certificate expiry date',
      expired: false,
      notAfter: null,
      severity: 'fail',
    }
  }

  const remaining = daysRemaining(expiry, now)
  const iso = expiry.toISOString()

  // Measured against the timestamp, not the floored day count: a certificate
  // that expired an hour ago has 0 days remaining by subtraction and is still
  // expired.
  if (expiry.getTime() <= now.getTime()) {
    return {
      daysRemaining: remaining,
      detail: `EXPIRED on ${iso} (${Math.abs(remaining)} days ago) -- every visitor is seeing a browser security warning`,
      expired: true,
      notAfter: iso,
      severity: 'fail',
    }
  }

  if (remaining <= failDays) {
    return {
      daysRemaining: remaining,
      detail: `expires ${iso} -- ${remaining} days left, at or inside the ${failDays}-day floor`,
      expired: false,
      notAfter: iso,
      severity: 'fail',
    }
  }

  if (remaining <= warnDays) {
    return {
      daysRemaining: remaining,
      detail: `expires ${iso} -- ${remaining} days left, renewal is overdue (warns at ${warnDays})`,
      expired: false,
      notAfter: iso,
      severity: 'warn',
    }
  }

  return {
    daysRemaining: remaining,
    detail: `expires ${iso} -- ${remaining} days left`,
    expired: false,
    notAfter: iso,
    severity: 'pass',
  }
}

// Certificate verification is on by default in both node:tls and global fetch,
// and this script never turns it off. But NODE_TLS_REJECT_UNAUTHORIZED=0 in the
// environment disables it process-wide, silently, for every connection -- which
// would make an expired certificate pass this script exactly the way it passed
// the deploy check. So the environment is checked too, and the answer is fail
// rather than warn: an unverified run is not a weaker run, it is a run whose
// headline result cannot be believed.
export const evaluateTlsEnforcement = (env = {}) => {
  const value = env.NODE_TLS_REJECT_UNAUTHORIZED

  if (value === '0') {
    return {
      detail:
        'NODE_TLS_REJECT_UNAUTHORIZED=0 is set -- certificate verification is disabled ' +
        'process-wide, so nothing this run reports about TLS can be trusted',
      severity: 'fail',
    }
  }

  return { detail: 'certificate verification is on (node default, never overridden)', severity: 'pass' }
}

// A base URL that is not https cannot have its certificate checked, and this
// reports that as a failure rather than skipping it. Pointing the script at a
// plain-HTTP local server is allowed -- it is how the route checks get exercised
// against a dev box -- but the run still goes red, because "TLS was not checked"
// and "TLS is fine" must never print the same colour.
export const evaluateBaseUrlScheme = (baseUrl) => {
  let parsed
  try {
    parsed = new URL(baseUrl)
  } catch {
    return { hostname: null, severity: 'fail', detail: `not a valid URL: ${baseUrl}` }
  }

  if (parsed.protocol !== 'https:') {
    return {
      detail: `${baseUrl} is not https -- the certificate cannot be checked from here`,
      hostname: parsed.hostname,
      severity: 'fail',
    }
  }

  return { detail: `${baseUrl} over https`, hostname: parsed.hostname, severity: 'pass' }
}

// One route's status. A wrong status is a failure whatever it is: these six
// paths are the deploy checklist, and a 302 or a 404 where a 200 belongs is a
// broken site even though nothing threw. 5xx is called out separately only so
// the report says "server error" rather than making a human decode the number.
export const evaluateRouteStatus = ({ error = null, expectedStatus = 200, status } = {}) => {
  if (error) return { detail: `request failed: ${error}`, severity: 'fail' }
  if (status === expectedStatus) return { detail: `HTTP ${status}`, severity: 'pass' }
  if (status >= 500) {
    return { detail: `HTTP ${status} server error (expected ${expectedStatus})`, severity: 'fail' }
  }
  return { detail: `HTTP ${status} (expected ${expectedStatus})`, severity: 'fail' }
}

// /api/health answers 200 with `{"ok":true,...}` (server/responses.js's envelope).
// The status alone is what the deploy script trusts and what stayed green through
// the outage, so the body is read as well -- a 200 carrying ok:false is a service
// that knows it is unwell and is being asked the wrong question.
export const evaluateHealthBody = (body) => {
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return { detail: 'response body is not JSON', severity: 'fail' }
  }

  if (payload?.ok !== true) {
    return { detail: `body reports ok=${JSON.stringify(payload?.ok)}`, severity: 'fail' }
  }

  return { detail: `ok=true, service=${payload.service ?? 'unnamed'}`, severity: 'pass' }
}

// robots.txt is generated by server/index.js, not shipped as a file, so its
// content is a live assertion about that handler rather than about the build.
// Warn, not fail: a crawler reading a thinner robots.txt costs indexing, not a
// visitor.
export const evaluateRobots = (body) => {
  const text = String(body ?? '')
  const missing = []

  if (!/^User-agent:/mi.test(text)) missing.push('a User-agent line')
  if (!/^Sitemap:\s*https?:\/\/\S+/mi.test(text)) missing.push('a Sitemap: URL')
  // The three private prefixes server/index.js disallows. Losing them means
  // crawl budget burned on per-user pages that cannot be indexed anyway.
  for (const prefix of ['/admin', '/account', '/login']) {
    if (!new RegExp(`^Disallow:\\s*${prefix}\\s*$`, 'mi').test(text)) {
      missing.push(`Disallow: ${prefix}`)
    }
  }

  if (missing.length) return { detail: `missing ${missing.join(', ')}`, severity: 'warn' }
  return { detail: 'User-agent, private-area Disallow rules and a Sitemap URL all present', severity: 'pass' }
}

export const extractSitemapUrls = (xml) => [
  ...String(xml ?? '').matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi),
].map((match) => match[1])

export const extractProjectUrls = (xml) =>
  extractSitemapUrls(xml).filter((url) => {
    try {
      return new URL(url).pathname.startsWith('/projects/')
    } catch {
      return false
    }
  })

// Rounds 23-24 added the sitemap so the project pages are discoverable without
// running JavaScript; the project entries come from a live catalogue read
// (server/index.js catches its own errors there and logs, then serves the
// sitemap anyway). So a sitemap with a homepage and nothing else is the visible
// shape of a catalogue read that failed -- worth reporting, not worth paging:
// a catalogue can also legitimately be empty.
export const evaluateSitemap = (xml) => {
  const text = String(xml ?? '')

  if (!/<urlset[\s>]/i.test(text)) {
    return { projectUrls: [], detail: 'response is not a sitemap urlset', severity: 'fail' }
  }

  const projectUrls = extractProjectUrls(text)
  if (!projectUrls.length) {
    return {
      detail: `${extractSitemapUrls(text).length} URLs listed, none of them a /projects/ page`,
      projectUrls,
      severity: 'warn',
    }
  }

  return {
    detail: `${extractSitemapUrls(text).length} URLs listed, ${projectUrls.length} of them projects`,
    projectUrls,
    severity: 'pass',
  }
}

export const extractTitle = (html) => {
  const match = String(html ?? '').match(/<title>([\s\S]*?)<\/title>/i)
  return match ? match[1].trim() : null
}

export const hasJsonLd = (html) =>
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(String(html ?? ''))

// server/seo.js rewrites the <head> per route on the way out. When that path
// throws, express still serves the built template, so the page renders, returns
// 200, and quietly wears the homepage's title and no structured data -- another
// failure with no error attached to it.
//
// Two severities on purpose. A project URL serving SITE_DEFAULT_TITLE means the
// injection did not run at all, which is a server fault affecting every HTML
// response, so it fails. A missing ld+json graph on a page that otherwise has
// its own title is a lost rich result, so it warns.
export const evaluateProjectHead = ({ defaultTitle = SITE_DEFAULT_TITLE, html } = {}) => {
  const title = extractTitle(html)
  const checks = []

  if (!title) {
    checks.push({ name: 'project page title', detail: 'no <title> in the response', severity: 'fail' })
  } else if (title === defaultTitle) {
    checks.push({
      detail: `serving the site default title (${defaultTitle}) -- per-route head injection did not run`,
      name: 'project page title',
      severity: 'fail',
    })
  } else {
    checks.push({ detail: `own title: ${title}`, name: 'project page title', severity: 'pass' })
  }

  checks.push(
    hasJsonLd(html)
      ? { detail: 'application/ld+json graph present', name: 'project page JSON-LD', severity: 'pass' }
      : {
          detail: 'no application/ld+json graph -- structured data is missing from this page',
          name: 'project page JSON-LD',
          severity: 'warn',
        },
  )

  return checks
}

export const worstSeverity = (severities) =>
  severities.reduce(
    (worst, severity) => (SEVERITY_ORDER[severity] > SEVERITY_ORDER[worst] ? severity : worst),
    'pass',
  )

// Warnings never move the exit code. A cron entry that goes red for a
// twenty-day-old certificate gets muted within a week, and a muted checker is
// the state this script was written to get out of.
export const summarize = (checks = []) => {
  const counts = { fail: 0, pass: 0, warn: 0 }
  for (const check of checks) counts[check.severity] = (counts[check.severity] ?? 0) + 1

  return {
    counts,
    exitCode: counts.fail > 0 ? 1 : 0,
    ok: counts.fail === 0,
    severity: worstSeverity(checks.map((check) => check.severity)),
  }
}

// Flag or env, flag wins. Kept pure so the precedence is a test rather than a
// paragraph in a README.
export const parseArgs = (argv = [], env = {}) => {
  const flags = argv.filter((argument) => argument.startsWith('--'))
  const baseUrlFlag = flags.find((flag) => flag.startsWith('--base-url='))

  const baseUrl = baseUrlFlag
    ? baseUrlFlag.slice('--base-url='.length)
    : env.CHECK_BASE_URL || DEFAULT_BASE_URL

  return {
    baseUrl: baseUrl.replace(/\/+$/, '') || baseUrl,
    json: flags.includes('--json'),
  }
}
