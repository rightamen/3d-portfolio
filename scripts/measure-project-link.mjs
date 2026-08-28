#!/usr/bin/env node
// How long a shared project link takes to show its panel, and what it would
// take if the 3D engine were not competing for bandwidth.
//
// Why this exists: round twenty-six tried to answer that question against a
// local express server behind CDP throttling and got a misleading answer -- no
// gain, so the change was dropped. Local express is HTTP/1.1, where Chrome
// queues requests over six connections and the panel's chunks simply go first.
// Production is HTTP/2, where everything is multiplexed and 971 KB of three.js
// takes bandwidth away from the 9 KB the panel needs. The contention only
// exists on the real stack, so this measures the real stack.
//
//   node scripts/measure-project-link.mjs
//   node scripts/measure-project-link.mjs --url https://mrright.blog/projects/md-leimu --runs 5
//
// It runs two interleaved arms so that link drift hits both equally:
//   normal    -- a cold load exactly as a visitor gets it
//   deferred  -- identical, except three-*.js is held back 20s, which is the
//                ceiling on what deferring the hero can ever buy
//
// The 3D chunks are DELAYED, never aborted: an aborted chunk makes the dynamic
// import fail, and src/main.jsx answers a chunk-load error by reloading the
// page -- the first version of this experiment measured a reload loop.
//
// Read-only: it loads public pages, sends no credentials, and writes nothing.
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const url = argOf('--url', 'https://mrright.blog/projects/md-leimu')
const runs = Number(argOf('--runs', '5'))
const selector = argOf('--selector', '.detail-overlay')
const holdMs = Number(argOf('--hold-ms', '20000'))
const timeoutMs = Number(argOf('--timeout-ms', '60000'))

const median = (values) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null

const once = async (browser, deferThree) => {
  // A fresh context every run: caches and connections must not carry over, or
  // the second arm measures a warm browser rather than a cold visitor.
  const context = await browser.newContext()
  const page = await context.newPage()

  if (deferThree) {
    await page.route('**/assets/three-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, holdMs))
      await route.continue()
    })
  }

  let bytes = 0
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.js')) {
      bytes += Number(response.headers()['content-length'] || 0)
    }
  })

  const started = Date.now()
  let seconds = null
  try {
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'commit' })
    await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs })
    seconds = (Date.now() - started) / 1000
  } catch {
    seconds = null
  }

  await context.close()
  return { kb: bytes / 1024, seconds }
}

const browser = await chromium.launch()
const arms = { deferred: [], normal: [] }

console.log(`${url}\n${runs} interleaved pairs, waiting for ${selector}\n`)

for (let run = 1; run <= runs; run += 1) {
  const normal = await once(browser, false)
  const deferred = await once(browser, true)
  if (normal.seconds !== null) arms.normal.push(normal.seconds)
  if (deferred.seconds !== null) arms.deferred.push(deferred.seconds)

  const show = (result) =>
    result.seconds === null ? '  >cap' : `${result.seconds.toFixed(1)}s`.padStart(6)
  console.log(
    `pair ${String(run).padStart(2)}:  normal ${show(normal)} (${normal.kb.toFixed(0).padStart(4)} KB)` +
      `   3D deferred ${show(deferred)} (${deferred.kb.toFixed(0).padStart(4)} KB)`,
  )
}

await browser.close()

const report = (label, values) => {
  const value = median(values)
  if (value === null) return `${label}: no completed runs`
  const low = Math.min(...values).toFixed(1)
  const high = Math.max(...values).toFixed(1)
  return `${label}: median ${value.toFixed(1)}s  (${low}-${high}s, ${values.length}/${runs} completed)`
}

console.log(`\n${report('normal     ', arms.normal)}`)
console.log(report('3D deferred', arms.deferred))

const gap = median(arms.normal) - median(arms.deferred)
if (Number.isFinite(gap)) {
  console.log(
    `\nHeadroom from keeping the 3D engine off the critical path: ${gap.toFixed(1)}s median.`,
  )
}
