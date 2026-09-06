#!/usr/bin/env node
// Checks the live site from outside, over real TLS, the way a visitor reaches
// it -- and in particular checks the certificate, which nothing else does.
//
// On 2026-09-04 the certificate expired and every visitor got a browser
// security warning for four hours and twenty-three minutes before anyone
// noticed, by accident, while doing something else. The application never
// errored. journalctl was clean. /api/health returned 200 for the whole
// outage, because the deploy script asks localhost over plain HTTP from inside
// the VPS -- a request that never touches TLS. Nothing external was watching.
//
// So this script is deliberately the check that would NOT have passed that
// afternoon: it opens a real TLS connection to the public hostname, reads the
// certificate's expiry, and fetches every route over https with verification
// left on. If the certificate is bad, the fetches fail; that is the design, and
// it is why there is no flag anywhere in here to relax it.
//
// Read-only by construction and by project rule (CLAUDE.md): GET only, no
// database, no filesystem writes, no credentials -- everything it looks at is
// public. Nothing it prints is a secret.
//
// The decisions live in scripts/lib/production-health.mjs (pure, unit-tested in
// tests/unit/production-health.spec.js); this file is the I/O around them --
// the same split as server/orphanedUploads.js + find-orphaned-uploads.mjs.
//
// Exit code: 0 when nothing failed, 1 when anything did. Warnings do not fail
// the run, so it is safe behind cron or an uptime runner.
//
//   node scripts/check-production.mjs
//   node scripts/check-production.mjs --json
//   node scripts/check-production.mjs --base-url=http://localhost:5000
//   CHECK_BASE_URL=https://staging.example.com node scripts/check-production.mjs
import process from 'node:process'
import tls from 'node:tls'

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
  parseArgs,
  REQUIRED_PATHS,
  summarize,
} from './lib/production-health.mjs'

const REQUEST_TIMEOUT_MS = 15000

const { baseUrl, json } = parseArgs(process.argv.slice(2), process.env)

const checks = []
const record = (name, result) => {
  checks.push({ name, ...result })
  return result
}

// GET only. No other method appears in this file, and none should: a health
// check that can change the thing it is measuring is not a health check.
const get = async (path) => {
  const url = `${baseUrl}${path}`
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'mrright-check-production/1 (+https://mrright.blog)' },
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return { body: await response.text(), status: response.status, url }
  } catch (error) {
    // An expired, self-signed or wrong-host certificate lands here, because
    // verification is on. That is the point: the failure is loud instead of
    // being a 200 from somewhere that never looked.
    return { error: error.message, url }
  }
}

// tls.connect verifies by default -- no options are passed that would change
// that. Reaching the callback at all means the chain validated; the expiry is
// then read from the peer certificate so the report can say how much runway is
// left rather than only "valid right now".
const readCertificate = (hostname, port = 443) =>
  new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname }, () => {
      const certificate = socket.getPeerCertificate()
      socket.end()
      resolve({
        issuer: certificate?.issuer?.O || certificate?.issuer?.CN || 'unknown',
        subject: certificate?.subject?.CN || hostname,
        validTo: certificate?.valid_to || null,
      })
    })

    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      socket.destroy(new Error(`TLS handshake timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })
    socket.on('error', (error) => resolve({ error: error.message }))
  })

// --- 1. verification is actually on -------------------------------------------
record('TLS verification enabled', evaluateTlsEnforcement(process.env))

// --- 2. the certificate ---------------------------------------------------------
const scheme = record('base URL is https', evaluateBaseUrlScheme(baseUrl))

let certificateInfo = null
if (scheme.severity === 'pass') {
  const peer = await readCertificate(scheme.hostname)

  if (peer.error) {
    record('TLS handshake', { detail: `handshake failed: ${peer.error}`, severity: 'fail' })
    record('certificate expiry', {
      detail: 'not read -- the handshake did not complete',
      severity: 'fail',
    })
  } else {
    record('TLS handshake', {
      detail: `chain verified for ${peer.subject}, issued by ${peer.issuer}`,
      severity: 'pass',
    })
    certificateInfo = record(
      'certificate expiry',
      evaluateCertificate({ notAfter: peer.validTo, now: new Date() }),
    )
  }
} else {
  record('TLS handshake', { detail: 'not attempted -- base URL is not https', severity: 'fail' })
  record('certificate expiry', { detail: 'not read -- base URL is not https', severity: 'fail' })
}

// --- 3. robots.txt and the sitemap ----------------------------------------------
// Fetched before the route list because the sitemap is where the seventh route
// comes from: production's catalogue lives in the database, so a hardcoded slug
// would go stale the first time a project is renamed.
const robots = await get('/robots.txt')
record('/robots.txt reachable', evaluateRouteStatus(robots))
if (!robots.error && robots.status === 200) record('robots.txt content', evaluateRobots(robots.body))

const sitemap = await get('/sitemap.xml')
record('/sitemap.xml reachable', evaluateRouteStatus(sitemap))

let projectPath = null
if (!sitemap.error && sitemap.status === 200) {
  const result = record('sitemap lists projects', evaluateSitemap(sitemap.body))
  if (result.projectUrls.length) projectPath = new URL(result.projectUrls[0]).pathname
}

// --- 4. the seven routes ---------------------------------------------------------
for (const path of REQUIRED_PATHS) {
  const response = await get(path)
  record(`GET ${path}`, evaluateRouteStatus(response))

  if (path === '/api/health' && !response.error && response.status === 200) {
    record('/api/health body', evaluateHealthBody(response.body))
  }
}

// --- 5. the seventh route, and its per-route <head> -------------------------------
if (projectPath) {
  const project = await get(projectPath)
  record(`GET ${projectPath}`, evaluateRouteStatus(project))

  if (!project.error && project.status === 200) {
    for (const check of evaluateProjectHead({ html: project.body })) {
      record(check.name, { detail: check.detail, severity: check.severity })
    }
  }
} else {
  // Never a silent pass. If no project URL could be discovered, the head checks
  // did not run, and the report says so rather than staying quiet.
  record('project route', {
    detail: 'not checked -- no /projects/ URL could be discovered from the sitemap',
    severity: 'warn',
  })
}

// --- report ----------------------------------------------------------------------
const summary = summarize(checks)
const checkedAt = new Date().toISOString()

if (json) {
  console.log(
    JSON.stringify(
      {
        baseUrl,
        certificate: certificateInfo
          ? { daysRemaining: certificateInfo.daysRemaining, notAfter: certificateInfo.notAfter }
          : null,
        checkedAt,
        checks,
        counts: summary.counts,
        ok: summary.ok,
        thresholdDays: { fail: CERT_FAIL_DAYS, warn: CERT_WARN_DAYS },
      },
      null,
      2,
    ),
  )
} else {
  const marks = { fail: 'FAIL', pass: 'ok  ', warn: 'WARN' }

  console.log(`Production health check -- ${baseUrl}`)
  console.log(`Checked at ${checkedAt}`)
  console.log('')
  for (const check of checks) console.log(`  ${marks[check.severity]}  ${check.name}: ${check.detail}`)
  console.log('')
  console.log(
    `${summary.counts.pass} passed, ${summary.counts.warn} warned, ${summary.counts.fail} failed. ` +
      `Certificate thresholds: warn at ${CERT_WARN_DAYS} days, fail at ${CERT_FAIL_DAYS}.`,
  )
  console.log(
    summary.ok
      ? 'Nothing failed. This run was read-only: GET requests only, no writes of any kind.'
      : 'FAILURES ABOVE. This run was read-only: GET requests only, no writes of any kind.',
  )
}

process.exit(summary.exitCode)
