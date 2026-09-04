import { describe, expect, it, vi } from 'vitest'

import { createContentHealthHeadline } from '../../server/contentHealthHeadline.js'

// Open item 4 said the dashboard deliberately had no content-health badge,
// because the check reads files off disk and /api/admin/overview is fetched
// every time the console opens. The cache is what closes that item, so the
// property under test is not "the counts show up" -- it is "the counts never
// cost the caller a file read".
//
// So the collector here is deliberately hostile: the cold-cache tests hand it
// a promise that never settles. If read() ever awaits its collector, or hands
// back a promise for the caller to await, those tests hang or fail instead of
// quietly passing on a fast fixture.

const pendingCollect = () => {
  const collect = vi.fn(() => new Promise(() => {}))
  return collect
}

const counts = (critical, warning = 0, note = 0) => ({
  checkedAt: '2026-09-04T00:00:00.000Z',
  counts: { critical, note, warning },
})

// A clock the test drives, so TTL expiry is a fact rather than a sleep.
const fakeClock = (start = 1_000_000) => {
  let value = start
  return { advance: (ms) => { value += ms }, now: () => value }
}

describe('a cold cache', () => {
  it('answers immediately instead of waiting for the collector', () => {
    const collect = pendingCollect()
    const headline = createContentHealthHeadline({ collect })

    // No await anywhere in this test: if read() were async, or awaited the
    // collector, there would be nothing to assert on this line.
    const first = headline.read()

    expect(first).toBeNull()
    expect(first).not.toBeInstanceOf(Promise)
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it('is still answering immediately on the next load while the sweep runs', () => {
    const collect = pendingCollect()
    const headline = createContentHealthHeadline({ collect })

    headline.read()
    expect(headline.read()).toBeNull()
    expect(headline.read()).toBeNull()

    // One sweep, not one per dashboard load: several admins on the console at
    // once must not each start their own walk of dist/ and public/uploads.
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it('populates in the background so the next load has the counts', async () => {
    const collect = vi.fn(async () => counts(2, 1, 3))
    const headline = createContentHealthHeadline({ collect })

    expect(headline.read()).toBeNull()
    await headline.refresh()

    expect(headline.read()).toEqual(counts(2, 1, 3))
  })
})

describe('a warm cache', () => {
  it('serves the cached counts without touching the collector again', async () => {
    const clock = fakeClock()
    const collect = vi.fn(async () => counts(1))
    const headline = createContentHealthHeadline({ collect, now: clock.now, ttlMs: 60_000 })

    await headline.refresh()
    expect(collect).toHaveBeenCalledTimes(1)

    clock.advance(59_999)
    expect(headline.read()).toEqual(counts(1))
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it('serves a stale value immediately and refreshes behind it', async () => {
    const clock = fakeClock()
    let next = counts(1)
    const collect = vi.fn(async () => next)
    const headline = createContentHealthHeadline({ collect, now: clock.now, ttlMs: 60_000 })

    await headline.refresh()
    clock.advance(60_000)
    next = counts(4)

    // Past its TTL, and still no waiting: the old number is better than a slow
    // page, and the new one lands for the load after this.
    expect(headline.read()).toEqual(counts(1))
    expect(collect).toHaveBeenCalledTimes(2)

    await vi.waitFor(() => expect(headline.read()).toEqual(counts(4)))
  })
})

describe('a check that fails', () => {
  it('does not reject, because nothing on the request path awaits it', async () => {
    const rejections = []
    const onRejection = (reason) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)

    const headline = createContentHealthHeadline({
      collect: async () => {
        throw new Error('dist/ is not built')
      },
    })

    expect(headline.read()).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', onRejection)

    expect(rejections).toEqual([])
  })

  it('reports the failure once and keeps the last good counts', async () => {
    const clock = fakeClock()
    const onError = vi.fn()
    let fail = false
    const collect = vi.fn(async () => {
      if (fail) throw new Error('dist/ went away')
      return counts(3)
    })
    const headline = createContentHealthHeadline({
      collect,
      now: clock.now,
      onError,
      ttlMs: 60_000,
    })

    await headline.refresh()
    fail = true
    clock.advance(60_000)
    await headline.refresh()

    expect(onError).toHaveBeenCalledTimes(1)
    // The badge keeps saying what it last knew rather than blinking off
    // because one sweep hit a bad moment.
    expect(headline.read()).toEqual(counts(3))
  })

  it('backs off instead of re-sweeping on every dashboard load', async () => {
    const clock = fakeClock()
    const collect = vi.fn(async () => {
      throw new Error('dist/ is not built')
    })
    const headline = createContentHealthHeadline({
      collect,
      now: clock.now,
      onError: () => {},
      ttlMs: 60_000,
    })

    await headline.refresh()
    for (let load = 0; load < 20; load += 1) expect(headline.read()).toBeNull()
    expect(collect).toHaveBeenCalledTimes(1)

    clock.advance(60_000)
    headline.read()
    expect(collect).toHaveBeenCalledTimes(2)
  })

  it('treats "nothing to report" as a non-answer rather than blanking the badge', async () => {
    const clock = fakeClock()
    let result = counts(5)
    const headline = createContentHealthHeadline({
      collect: async () => result,
      now: clock.now,
      ttlMs: 60_000,
    })

    await headline.refresh()
    // What the server does when there is no admin store to list projects from.
    result = null
    clock.advance(60_000)
    await headline.refresh()

    expect(headline.read()).toEqual(counts(5))
  })
})
