#!/usr/bin/env node
// Runs the production health check and emails the site owner when it fails.
//
// This is the half that turns a checker into a watcher. On 2026-09-04 the TLS
// certificate expired and nobody knew for four and a half hours -- not because
// the failure was hard to detect, but because nothing was looking. A checker
// that only runs when someone remembers to run it has the same blind spot as
// no checker at all.
//
// It is a separate script from check-production.mjs on purpose. That one is
// strictly read-only -- GET requests and nothing else -- and it is worth being
// able to say so without qualification. Sending mail is a side effect, so it
// lives here, and the checker is spawned as a subprocess rather than imported.
// Its JSON output is the whole interface between them.
//
//   node scripts/notify-production-health.mjs
//   node scripts/notify-production-health.mjs --dry-run   # print, never send
//
// Intended to be run from cron on the VPS, once a day. See
// PROJECT_PROGRESS.md for what this deliberately does NOT cover: cron runs on
// the machine being watched, so a dead box sends nothing. That gap wants an
// external uptime service, not more code here.
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { profile } from '../server/content.js'
import { isEmailDeliveryConfigured, sendMail } from '../server/emailDelivery.js'

const execFileAsync = promisify(execFile)

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkerPath = path.join(rootDir, 'scripts', 'check-production.mjs')

const dryRun = process.argv.includes('--dry-run')

// The checker exits non-zero when something failed, which makes execFile
// reject. That is the interesting case, not an error in itself, so both
// outcomes are funnelled into the same shape and the stdout is what matters.
const runChecker = async () => {
  try {
    const { stdout } = await execFileAsync(process.execPath, [checkerPath, '--json'], {
      cwd: rootDir,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { exitCode: 0, stdout }
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim()) {
      return { exitCode: error.code ?? 1, stdout: error.stdout }
    }
    // No parseable output at all: the checker itself is broken or could not
    // start. That is a failure to report, not a reason to stay quiet -- a
    // watcher that goes silent when its own tooling breaks is the exact
    // failure mode this script exists to remove.
    return { crashed: error, exitCode: error.code ?? 1, stdout: '' }
  }
}

const describe = (report) => {
  const failed = (report?.checks || []).filter((check) => check.severity === 'fail')
  const warned = (report?.checks || []).filter((check) => check.severity === 'warn')

  const lines = [
    `Production health check failed for ${report?.baseUrl || 'mrright.blog'}.`,
    `Checked at ${report?.checkedAt || new Date().toISOString()}.`,
    '',
    ...failed.map((check) => `FAIL  ${check.name}: ${check.detail}`),
    ...(warned.length ? ['', ...warned.map((check) => `warn  ${check.name}: ${check.detail}`)] : []),
    '',
    'Re-run it yourself with:  npm run check:production',
  ]

  return lines.join('\n')
}

const report = await runChecker()

if (report.crashed) {
  const plain = [
    'The production health check could not run at all.',
    '',
    String(report.crashed.message || report.crashed).slice(0, 800),
    '',
    'This is itself worth looking at: the checker is how the site is watched.',
  ].join('\n')

  console.error(plain)
  if (!dryRun && isEmailDeliveryConfigured()) {
    await sendMail({
      email: profile.email,
      plain,
      subject: '[mrright.blog] health check could not run',
    })
  }
  process.exit(1)
}

let parsed = null
try {
  parsed = JSON.parse(report.stdout)
} catch {
  console.error('The checker produced output that is not JSON. Raw output follows:')
  console.error(report.stdout.slice(0, 2000))
  process.exit(1)
}

if (parsed.ok) {
  // Silence on success is deliberate: a daily "everything is fine" mail is a
  // mail you stop reading, and an alert you have trained yourself to ignore is
  // not an alert. The cost is that a cron which stops running looks exactly
  // like a healthy site -- see the note at the top.
  console.log(
    `ok -- ${parsed.counts.pass} passed, ${parsed.counts.warn} warned. ` +
      `Certificate: ${parsed.certificate?.daysRemaining ?? '?'} days left. No mail sent.`,
  )
  process.exit(0)
}

const plain = describe(parsed)
console.error(plain)

if (dryRun) {
  console.error('\n--dry-run: no mail sent.')
  process.exit(1)
}

if (!isEmailDeliveryConfigured()) {
  // Loudly, not quietly. An unnotifiable notifier is the same silent failure
  // this whole thing was built to stop.
  console.error('\nSMTP is not configured, so nobody was told. Fix that before trusting this.')
  process.exit(1)
}

// The host goes in the subject rather than a hardcoded name: pointed at a
// staging or local URL this still sends, and an alert that misnames what it is
// about is worse than no subject line at all.
const host = (() => {
  try {
    return new URL(parsed.baseUrl).host
  } catch {
    return 'mrright.blog'
  }
})()

await sendMail({
  email: profile.email,
  plain,
  subject: `[${host}] health check FAILED (${parsed.counts.fail})`,
})

console.error('\nFailure mail sent.')
process.exit(1)
