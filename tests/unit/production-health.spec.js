import { describe, expect, it } from 'vitest'

import {
  CERT_FAIL_DAYS,
  CERT_WARN_DAYS,
  evaluateBaseUrlScheme,
  evaluateCertificate,
  evaluateHealthBody,
  evaluateProjectHead,
  evaluateRobots,
  evaluateRouteStatus,
  evaluateSitemap,
  evaluateTlsEnforcement,
  extractProjectUrls,
  parseArgs,
  SITE_DEFAULT_TITLE,
  summarize,
} from '../../scripts/lib/production-health.mjs'

// scripts/check-production.mjs exists because of one incident: on 2026-09-04 the
// TLS certificate expired and every visitor got a browser security warning for
// four hours and twenty-three minutes while /api/health answered 200, the logs
// stayed clean, and nobody was watching from outside. The script's whole value
// is that it turns facts about the live site into a severity, and only a `fail`
// wakes anyone up.
//
// That makes the threshold arithmetic the load-bearing part. A boundary that is
// off by one day either pages the team for a certificate with three weeks of
// runway (which gets the cron muted, and then the next expiry is invisible
// again) or stays quiet through the last week before expiry (which is the
// outage, repeated). So the cases below sit ON the boundaries rather than
// comfortably inside the ranges, and they cover the direction that hurts most:
// an already-expired certificate must never come back as anything but a fail.
//
// These are pure functions taking `now` as an argument, so nothing here depends
// on the clock or the network.

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-06T12:00:00.000Z')
const inDays = (days, offsetMs = 0) => new Date(NOW.getTime() + days * DAY + offsetMs)

describe('evaluateCertificate thresholds', () => {
  it('passes a certificate with months of runway', () => {
    // The real one after the 2026-09-04 reissue: valid to 2026-12-03.
    const result = evaluateCertificate({ notAfter: new Date('2026-12-03T00:00:00.000Z'), now: NOW })

    expect(result.severity).toBe('pass')
    expect(result.daysRemaining).toBe(87)
    expect(result.notAfter).toBe('2026-12-03T00:00:00.000Z')
  })

  // The day the warning starts. 22 days is still quiet; 21 is the first day the
  // report says something. Renewal happens around 30 days out, so 21 means it
  // has already been missed once.
  it('is still quiet one day above the warn threshold', () => {
    expect(evaluateCertificate({ notAfter: inDays(CERT_WARN_DAYS + 1), now: NOW }).severity).toBe(
      'pass',
    )
  })

  it('warns on the exact day it crosses the warn threshold', () => {
    const result = evaluateCertificate({ notAfter: inDays(CERT_WARN_DAYS), now: NOW })

    expect(result.severity).toBe('warn')
    expect(result.daysRemaining).toBe(CERT_WARN_DAYS)
  })

  // Days are floored, so a certificate with 21 days and 23 hours left reports 21
  // and warns. Rounding up would delay every threshold by up to a day, and this
  // is not a place to be generous with itself.
  it('rounds partial days down, so the warning starts early rather than late', () => {
    const result = evaluateCertificate({ notAfter: inDays(CERT_WARN_DAYS, 23 * 60 * 60 * 1000), now: NOW })

    expect(result.daysRemaining).toBe(CERT_WARN_DAYS)
    expect(result.severity).toBe('warn')
  })

  // The other boundary: the last day that only warns, and the first that fails.
  it('still only warns one day above the fail threshold', () => {
    const result = evaluateCertificate({ notAfter: inDays(CERT_FAIL_DAYS + 1), now: NOW })

    expect(result.severity).toBe('warn')
    expect(result.daysRemaining).toBe(CERT_FAIL_DAYS + 1)
  })

  it('fails on the exact day it crosses the fail threshold', () => {
    const result = evaluateCertificate({ notAfter: inDays(CERT_FAIL_DAYS), now: NOW })

    expect(result.severity).toBe('fail')
    expect(result.expired).toBe(false)
    expect(result.daysRemaining).toBe(CERT_FAIL_DAYS)
  })

  it('fails with a day left', () => {
    expect(evaluateCertificate({ notAfter: inDays(1), now: NOW }).severity).toBe('fail')
  })

  // The incident itself. An expired certificate has to be distinguishable from a
  // merely-urgent one, because the message a human reads at 3am is different:
  // one is "renew this week", the other is "the site is down right now".
  it('fails an already-expired certificate and says so', () => {
    const result = evaluateCertificate({ notAfter: inDays(-3), now: NOW })

    expect(result.severity).toBe('fail')
    expect(result.expired).toBe(true)
    expect(result.detail).toContain('EXPIRED')
  })

  // Expiry an hour ago floors to 0 days remaining, which is also what a
  // certificate expiring in 20 minutes floors to. The expired flag comes from the
  // timestamp comparison, not the day count, so the two do not collapse together.
  it('treats a certificate that expired within the last day as expired, not as urgent', () => {
    const justExpired = evaluateCertificate({ notAfter: inDays(0, -60 * 60 * 1000), now: NOW })
    const aboutToExpire = evaluateCertificate({ notAfter: inDays(0, 20 * 60 * 1000), now: NOW })

    expect(justExpired.expired).toBe(true)
    expect(aboutToExpire.expired).toBe(false)
    expect(aboutToExpire.severity).toBe('fail')
  })

  // The exact tie. A certificate is valid up to and including notAfter and not
  // one millisecond past it, so the instant the clock reaches it, it is expired.
  // Pinned because the day count floors to 0 here, the same as a certificate
  // with twenty hours left -- only the timestamp comparison tells them apart,
  // and swapping it for a day-count test would quietly lose this case.
  it('calls a certificate expiring at this exact instant expired', () => {
    const result = evaluateCertificate({ notAfter: new Date(NOW.getTime()), now: NOW })

    expect(result.expired).toBe(true)
    expect(result.severity).toBe('fail')
    expect(result.detail).toContain('EXPIRED')
  })

  it('fails when the expiry cannot be read at all, rather than assuming the best', () => {
    // The unchecked case must never look like the checked-and-fine case -- that
    // equivalence is exactly what let the outage run for four hours.
    for (const value of [null, undefined, '', 'not a date', {}]) {
      const result = evaluateCertificate({ notAfter: value, now: NOW })
      expect(result.severity, JSON.stringify(value)).toBe('fail')
      expect(result.notAfter, JSON.stringify(value)).toBeNull()
    }
  })

  it('reads the OpenSSL date format tls.getPeerCertificate() actually returns', () => {
    // `valid_to` is a string like this, not an ISO timestamp.
    const result = evaluateCertificate({ notAfter: 'Dec  3 08:15:42 2026 GMT', now: NOW })

    expect(result.severity).toBe('pass')
    expect(result.notAfter).toBe('2026-12-03T08:15:42.000Z')
  })

  it('honours caller-supplied thresholds instead of hardcoding its own', () => {
    const result = evaluateCertificate({ failDays: 30, notAfter: inDays(25), now: NOW, warnDays: 60 })

    expect(result.severity).toBe('fail')
  })
})

// The one environment variable that can silently undo this whole script: set to
// '0', node stops verifying certificates everywhere, and an expired one would
// sail through the fetches exactly as it sailed through the deploy's
// localhost-over-HTTP health check.
describe('evaluateTlsEnforcement', () => {
  it('fails when NODE_TLS_REJECT_UNAUTHORIZED disables verification', () => {
    const result = evaluateTlsEnforcement({ NODE_TLS_REJECT_UNAUTHORIZED: '0' })

    expect(result.severity).toBe('fail')
    expect(result.detail).toContain('NODE_TLS_REJECT_UNAUTHORIZED')
  })

  it('passes when the variable is unset or left at its default', () => {
    expect(evaluateTlsEnforcement({}).severity).toBe('pass')
    expect(evaluateTlsEnforcement({ NODE_TLS_REJECT_UNAUTHORIZED: '1' }).severity).toBe('pass')
  })
})

describe('evaluateBaseUrlScheme', () => {
  it('passes https and reports the hostname the certificate will be read from', () => {
    const result = evaluateBaseUrlScheme('https://mrright.blog')

    expect(result.severity).toBe('pass')
    expect(result.hostname).toBe('mrright.blog')
  })

  // Pointing the script at a plain-HTTP local server is allowed, but the run
  // still goes red: "TLS was not checked" must never print the same colour as
  // "TLS is fine".
  it('fails a plain-HTTP base URL rather than quietly skipping the certificate', () => {
    expect(evaluateBaseUrlScheme('http://localhost:5000').severity).toBe('fail')
  })

  it('fails an unparseable base URL', () => {
    expect(evaluateBaseUrlScheme('mrright.blog').severity).toBe('fail')
  })
})

describe('evaluateRouteStatus', () => {
  it('passes the expected status', () => {
    expect(evaluateRouteStatus({ status: 200 }).severity).toBe('pass')
  })

  it('fails a 5xx and names it as a server error', () => {
    const result = evaluateRouteStatus({ status: 502 })

    expect(result.severity).toBe('fail')
    expect(result.detail).toContain('server error')
  })

  // A redirect where a page belongs is a broken route even though nothing
  // threw -- the fetches use redirect:'manual' so this is observable at all.
  it('fails a redirect or a 404 on a route that must serve a page', () => {
    expect(evaluateRouteStatus({ status: 302 }).severity).toBe('fail')
    expect(evaluateRouteStatus({ status: 404 }).severity).toBe('fail')
  })

  // A TLS error arrives here, not as a status: an expired certificate makes
  // fetch throw. That has to be a failure and not an absence of a result.
  it('fails when the request itself could not be made', () => {
    const result = evaluateRouteStatus({ error: 'certificate has expired' })

    expect(result.severity).toBe('fail')
    expect(result.detail).toContain('certificate has expired')
  })
})

describe('evaluateHealthBody', () => {
  it('passes the envelope the service actually returns', () => {
    const result = evaluateHealthBody('{"ok":true,"service":"mrright-portfolio","error":null}')

    expect(result.severity).toBe('pass')
    expect(result.detail).toContain('mrright-portfolio')
  })

  // A 200 carrying ok:false is the service saying it is unwell to a caller that
  // was only ever looking at the status line.
  it('fails a 200 whose body says otherwise', () => {
    expect(evaluateHealthBody('{"ok":false}').severity).toBe('fail')
  })

  it('fails when the body is not JSON at all', () => {
    // What a reverse-proxy error page or a captive portal would return.
    expect(evaluateHealthBody('<html>502 Bad Gateway</html>').severity).toBe('fail')
  })
})

describe('evaluateRobots', () => {
  const goodRobots = [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /api/',
    'Allow: /',
    '',
    'Sitemap: https://mrright.blog/sitemap.xml',
    '',
  ].join('\n')

  it('passes the file server/index.js generates', () => {
    expect(evaluateRobots(goodRobots).severity).toBe('pass')
  })

  // Warn, not fail: a thinner robots.txt costs indexing, not a visitor.
  it('warns when the sitemap pointer is gone', () => {
    const withoutSitemap = goodRobots.replace(/^Sitemap:.*$/m, '')

    expect(evaluateRobots(withoutSitemap).severity).toBe('warn')
  })

  it('warns when a private area stops being disallowed', () => {
    expect(evaluateRobots(goodRobots.replace('Disallow: /account\n', '')).severity).toBe('warn')
  })
})

describe('evaluateSitemap', () => {
  const sitemap = (locs) =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...locs.map((loc) => `  <url><loc>${loc}</loc></url>`),
      '</urlset>',
    ].join('\n')

  it('passes and hands back the project URLs it found', () => {
    const result = evaluateSitemap(
      sitemap([
        'https://mrright.blog/',
        'https://mrright.blog/community',
        'https://mrright.blog/projects/md-leimu',
        'https://mrright.blog/community/1781534266556-atb11d',
      ]),
    )

    expect(result.severity).toBe('pass')
    expect(result.projectUrls).toEqual(['https://mrright.blog/projects/md-leimu'])
  })

  // The sitemap's project entries come from a live catalogue read that
  // server/index.js catches and logs rather than failing on -- so "no projects"
  // is the visible shape of a database read that silently did not work. Worth
  // reporting; not worth paging, because an empty catalogue is also legal.
  it('warns when the catalogue contributed nothing', () => {
    const result = evaluateSitemap(sitemap(['https://mrright.blog/', 'https://mrright.blog/community']))

    expect(result.severity).toBe('warn')
    expect(result.projectUrls).toEqual([])
  })

  it('fails when the response is not a sitemap at all', () => {
    // What an SPA fallback would serve if the route were ever lost.
    expect(evaluateSitemap('<!doctype html><html><body>...</body></html>').severity).toBe('fail')
  })

  it('does not mistake a community post URL for a project', () => {
    expect(
      extractProjectUrls(sitemap(['https://mrright.blog/community/1781534266556-atb11d'])),
    ).toEqual([])
  })
})

describe('evaluateProjectHead', () => {
  const projectPage =
    '<!doctype html><html><head><title>MD Leimu | mrright.blog</title>' +
    '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' +
    '</head><body></body></html>'

  it('passes a page carrying its own title and a graph', () => {
    const checks = evaluateProjectHead({ html: projectPage })

    expect(checks.map((check) => check.severity)).toEqual(['pass', 'pass'])
  })

  // server/seo.js rewrites the head per route on the way out. If that throws,
  // express serves the built template anyway: 200, no error in the log, and the
  // homepage's title on a project URL. That is a server fault affecting every
  // HTML response, so it fails rather than warns.
  it('fails when a project page is wearing the site default title', () => {
    const html = projectPage.replace('MD Leimu | mrright.blog', SITE_DEFAULT_TITLE)
    const [title] = evaluateProjectHead({ html })

    expect(title.severity).toBe('fail')
    expect(title.detail).toContain('did not run')
  })

  it('fails when there is no title element to read', () => {
    expect(evaluateProjectHead({ html: '<html><head></head></html>' })[0].severity).toBe('fail')
  })

  // A lost rich result, not a lost visitor.
  it('warns when the JSON-LD graph is missing but the title is the page own', () => {
    const html = projectPage.replace(/<script[\s\S]*?<\/script>/, '')
    const [title, jsonLd] = evaluateProjectHead({ html })

    expect(title.severity).toBe('pass')
    expect(jsonLd.severity).toBe('warn')
  })
})

// The exit code is the whole contract with cron. A run that fails the build on a
// twenty-day-old certificate gets muted within a week, and a muted checker is
// the state this script was written to get out of.
describe('summarize', () => {
  it('exits zero when everything passes', () => {
    expect(summarize([{ severity: 'pass' }, { severity: 'pass' }]).exitCode).toBe(0)
  })

  it('exits zero on warnings alone, so warnings never train anyone to ignore it', () => {
    const summary = summarize([{ severity: 'pass' }, { severity: 'warn' }, { severity: 'warn' }])

    expect(summary.exitCode).toBe(0)
    expect(summary.ok).toBe(true)
    expect(summary.severity).toBe('warn')
  })

  it('exits non-zero as soon as one check fails, however many passed', () => {
    const summary = summarize([{ severity: 'pass' }, { severity: 'warn' }, { severity: 'fail' }])

    expect(summary.exitCode).toBe(1)
    expect(summary.ok).toBe(false)
    expect(summary.counts).toEqual({ fail: 1, pass: 1, warn: 1 })
  })

  it('exits zero on no checks at all only because there is nothing to report', () => {
    expect(summarize([]).exitCode).toBe(0)
  })
})

describe('parseArgs', () => {
  it('defaults to production with no flags and no environment', () => {
    expect(parseArgs([], {})).toEqual({ baseUrl: 'https://mrright.blog', json: false })
  })

  it('takes the base URL from the environment', () => {
    expect(parseArgs([], { CHECK_BASE_URL: 'https://staging.example.com' }).baseUrl).toBe(
      'https://staging.example.com',
    )
  })

  it('lets the flag win over the environment', () => {
    const parsed = parseArgs(['--base-url=http://localhost:5000'], {
      CHECK_BASE_URL: 'https://staging.example.com',
    })

    expect(parsed.baseUrl).toBe('http://localhost:5000')
  })

  it('trims a trailing slash so paths are not joined with a double slash', () => {
    expect(parseArgs(['--base-url=https://mrright.blog/'], {}).baseUrl).toBe('https://mrright.blog')
  })

  it('recognises --json', () => {
    expect(parseArgs(['--json'], {}).json).toBe(true)
  })
})
