import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminSession,
  downloadProjectSource,
  getCommunityComments,
  getCurrentVisitor,
  getProfile,
  loginVisitor,
} from '../../src/lib/api'

// Everything the site knows about the server goes through one `request()`
// helper, which is not exported -- so it is exercised through the callers that
// use it, with fetch stubbed. The interesting behaviour is all in the edges:
// the response envelope, and the four different shapes an error can arrive in.

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

const stubFetch = (response) => {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the response envelope', () => {
  it('lifts the data fields to the top level', async () => {
    stubFetch(jsonResponse({ data: { profile: { name: 'Right' }, skills: ['ZBrush'] }, error: null }))

    const payload = await getProfile()

    expect(payload.profile).toEqual({ name: 'Right' })
    expect(payload.skills).toEqual(['ZBrush'])
  })

  it('leaves a response that is not an envelope untouched', async () => {
    stubFetch(jsonResponse({ profile: { name: 'Right' } }))

    expect(await getProfile()).toEqual({ profile: { name: 'Right' } })
  })

  it('does not mistake a null-data envelope for one it can spread', async () => {
    stubFetch(jsonResponse({ data: null, error: null }))

    expect(await getProfile()).toEqual({ data: null, error: null })
  })

  it('treats an empty body as an empty object', async () => {
    stubFetch(jsonResponse(''))

    expect(await getProfile()).toEqual({})
  })
})

describe('the shapes an error arrives in', () => {
  it('carries code, status and message off the envelope', async () => {
    stubFetch(jsonResponse({ data: null, error: { code: 'AUTH_REQUIRED', message: 'Sign in.' } }, 401))

    await expect(getCurrentVisitor('stale-token')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      message: 'Sign in.',
      status: 401,
    })
  })

  it('accepts the legacy shape where error is a bare string', async () => {
    stubFetch(jsonResponse({ error: 'Something broke' }, 500))

    await expect(getProfile()).rejects.toMatchObject({
      message: 'Something broke',
      status: 500,
    })
  })

  // A proxy or nginx error page is HTML. On the failure path the parse error is
  // swallowed on purpose (`parseJsonBody(...).catch(() => ({}))`) so the caller
  // gets the shared error shape with the status, not a bare SyntaxError.
  it('turns an HTML error page into the shared error shape', async () => {
    stubFetch(jsonResponse('<html><body><h1>502 Bad Gateway</h1></body></html>', 502))

    const error = await getProfile().catch((caught) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Request failed')
    expect(error.status).toBe(502)
    expect(error.name).not.toBe('SyntaxError')
  })

  // The other direction, and the only place 'Unexpected server response' can
  // come from: a 200 whose body is not JSON -- an interception page, or a proxy
  // answering for the origin.
  it('rejects a 200 that is not JSON instead of returning garbage', async () => {
    stubFetch(jsonResponse('<html><body>Sign in to the network</body></html>', 200))

    await expect(getProfile()).rejects.toMatchObject({
      message: 'Unexpected server response',
      status: 200,
    })
  })

  it('still throws when the failing response has no body at all', async () => {
    stubFetch(jsonResponse('', 503))

    await expect(getProfile()).rejects.toMatchObject({
      message: 'Request failed',
      status: 503,
    })
  })
})

describe('authorization headers', () => {
  it('attaches the bearer token when there is one', async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { comments: [] }, error: null }))

    await getCommunityComments('post-1', { token: 'visitor-token' })

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer visitor-token',
    })
  })

  // Signed-out visitors read the same endpoint. Sending `Authorization: Bearer
  // undefined` would be rejected rather than treated as anonymous.
  it('sends no Authorization header at all when there is no token', async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { comments: [] }, error: null }))

    await getCommunityComments('post-1')

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('puts the static admin token in the header, never in the body', async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { session: { token: 's' } }, error: null }))

    await createAdminSession('static-admin-token')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/session')
    expect(init.headers.Authorization).toBe('Bearer static-admin-token')
    expect(init.body).toBe('{}')
  })

  it('sends the sign-in payload as JSON on a no-store POST', async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { session: {}, user: {} }, error: null }))

    await loginVisitor({ email: 'someone@example.com', password: 'secret' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(JSON.parse(init.body)).toEqual({
      email: 'someone@example.com',
      password: 'secret',
    })
  })
})

describe('downloadProjectSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  // A hidden iframe, not window.location: a failed download must not navigate
  // the SPA away from the project the visitor was reading.
  it('navigates a hidden iframe to the ticket url', async () => {
    stubFetch(jsonResponse({ data: { ticket: { url: '/api/downloads/one-shot-abc' } }, error: null }))

    await downloadProjectSource('next-gen-prop', 'visitor-token')

    const frame = document.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame.src).toContain('/api/downloads/one-shot-abc')
    expect(frame.style.display).toBe('none')
  })

  it('cleans the iframe up rather than leaving it in the document', async () => {
    stubFetch(jsonResponse({ data: { ticket: { url: '/api/downloads/one-shot-abc' } }, error: null }))

    await downloadProjectSource('next-gen-prop', 'visitor-token')
    expect(document.querySelectorAll('iframe')).toHaveLength(1)

    vi.advanceTimersByTime(60_000)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('refuses a ticket response with no url instead of navigating nowhere', async () => {
    stubFetch(jsonResponse({ data: { ticket: {} }, error: null }))

    await expect(downloadProjectSource('next-gen-prop', 'visitor-token')).rejects.toThrow(
      'Download failed',
    )
    expect(document.querySelector('iframe')).toBeNull()
  })
})
