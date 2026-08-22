import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  absoluteUrl,
  buildPageMeta,
  collapseWhitespace,
  escapeHtml,
  injectSeo,
  renderHead,
  renderNoscript,
  renderSeoHtml,
  resolveRoute,
  truncateText,
} from '../../server/seo.js'

// The head this module builds is the only thing a link-preview scraper ever
// sees, and half of what goes into it is written by visitors. So the two things
// under test are: does each route get the right head, and does user text stay
// text when it lands inside content="...".

const siteUrl = 'https://mrright.blog'

const template = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="description" content="template default" />',
  '    <meta property="og:title" content="template default" />',
  '    <link rel="icon" href="/favicon.svg" />',
  '    <title>mrright.blog | 3D Portfolio</title>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
  '',
].join('\n')

const post = {
  createdAt: '2026-08-20T10:00:00.000Z',
  id: '1755600000000-ab12cd',
  message: 'Notes on getting clean normals off a high-poly sculpt.',
  title: 'Baking normals',
  topic: 'workflow',
  updatedAt: '2026-08-21T10:00:00.000Z',
  user: { displayName: 'Rin Sato', handle: 'rin-sato' },
}

const profile = {
  avatarUrl: '/uploads/avatars/rin.png',
  bio: 'Environment artist, mostly props.',
  displayName: 'Rin Sato',
  handle: 'rin-sato',
  location: 'Osaka',
  profilePublic: true,
}

const headFor = (route, data = {}) => renderHead(buildPageMeta({ route, siteUrl, ...data }))

describe('text helpers', () => {
  it('escapes the characters that would break out of an attribute', () => {
    expect(escapeHtml(`" > < & '`)).toBe('&quot; &gt; &lt; &amp; &#39;')
  })

  it('treats null and undefined as empty rather than printing them', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(collapseWhitespace(null)).toBe('')
  })

  it('collapses newlines and runs of spaces into single spaces', () => {
    expect(collapseWhitespace('  a\n\n b \t c  ')).toBe('a b c')
  })

  it('leaves a short description alone', () => {
    expect(truncateText('Short enough.')).toBe('Short enough.')
  })

  it('cuts a long description on a word boundary and marks the cut', () => {
    const truncated = truncateText('word '.repeat(60))

    expect(truncated.length).toBeLessThanOrEqual(160)
    expect(truncated.endsWith('…')).toBe(true)
    expect(truncated).not.toContain('wor…')
  })

  it('still cuts when the text has no spaces to cut on', () => {
    const truncated = truncateText('x'.repeat(400), 40)

    expect(truncated).toHaveLength(40)
    expect(truncated.endsWith('…')).toBe(true)
  })

  it('passes absolute urls through and roots relative ones at the site', () => {
    expect(absoluteUrl(siteUrl, 'https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(absoluteUrl(siteUrl, '/a.png')).toBe('https://mrright.blog/a.png')
    expect(absoluteUrl('https://mrright.blog/', 'a.png')).toBe('https://mrright.blog/a.png')
    expect(absoluteUrl(siteUrl, '')).toBe('')
  })
})

describe('resolveRoute', () => {
  it('maps the public routes', () => {
    expect(resolveRoute('/')).toMatchObject({ canonicalPath: '/', kind: 'home' })
    expect(resolveRoute('/community')).toMatchObject({
      canonicalPath: '/community',
      kind: 'community',
    })
    expect(resolveRoute('/community/abc-123')).toMatchObject({
      canonicalPath: '/community/abc-123',
      kind: 'post',
      postId: 'abc-123',
    })
    expect(resolveRoute('/u/rin-sato')).toMatchObject({
      canonicalPath: '/u/rin-sato',
      handle: 'rin-sato',
      kind: 'profile',
    })
  })

  it('collapses a route with tabs below it onto one canonical url', () => {
    expect(resolveRoute('/u/rin-sato/posts').canonicalPath).toBe('/u/rin-sato')
    expect(resolveRoute('/community/abc-123/comments').canonicalPath).toBe('/community/abc-123')
  })

  it('ignores a trailing slash but keeps the root', () => {
    expect(resolveRoute('/community/').canonicalPath).toBe('/community')
    expect(resolveRoute('/').canonicalPath).toBe('/')
  })

  it('normalizes a handle the way the API does', () => {
    expect(resolveRoute('/u/@Rin-Sato').handle).toBe('rin-sato')
  })

  it('marks the per-user and privileged areas private', () => {
    for (const path of ['/admin', '/admin/whatever', '/account', '/login', '/login/reset']) {
      expect(resolveRoute(path)).toMatchObject({ canonicalPath: null, kind: 'private' })
    }
  })

  it('refuses to turn junk into a database lookup', () => {
    expect(resolveRoute('/u/ab').kind).toBe('unknown')
    expect(resolveRoute('/u/' + 'a'.repeat(40)).kind).toBe('unknown')
    expect(resolveRoute('/community/' + 'a'.repeat(200)).kind).toBe('unknown')
    expect(resolveRoute('/community/../../etc/passwd').kind).toBe('unknown')
  })

  it('survives a malformed percent escape instead of throwing', () => {
    expect(() => resolveRoute('/u/%E0%A4%A')).not.toThrow()
    expect(resolveRoute('/u/%E0%A4%A').kind).toBe('unknown')
  })

  it('calls anything else unknown', () => {
    expect(resolveRoute('/no-such-page')).toMatchObject({ canonicalPath: null, kind: 'unknown' })
  })
})

describe('buildPageMeta', () => {
  it('gives the homepage the site defaults and a canonical url', () => {
    const meta = buildPageMeta({ route: resolveRoute('/'), siteUrl })

    expect(meta).toMatchObject({
      canonical: 'https://mrright.blog/',
      description: DEFAULT_DESCRIPTION,
      noindex: false,
      ogType: 'website',
      title: DEFAULT_TITLE,
    })
  })

  it('titles a post with its own title and describes it with its body', () => {
    const meta = buildPageMeta({ post, route: resolveRoute(`/community/${post.id}`), siteUrl })

    expect(meta.title).toBe('Baking normals | mrright.blog Community')
    expect(meta.description).toBe(post.message)
    expect(meta.ogType).toBe('article')
    expect(meta.noindex).toBe(false)
    expect(meta.properties).toEqual(
      expect.arrayContaining([
        ['article:published_time', post.createdAt],
        ['article:author', 'Rin Sato'],
        ['article:section', 'workflow'],
      ]),
    )
  })

  it('keeps a post that could not be loaded out of the index', () => {
    const meta = buildPageMeta({ post: null, route: resolveRoute('/community/gone'), siteUrl })

    expect(meta.noindex).toBe(true)
    expect(meta.title).toBe('Community | mrright.blog')
  })

  it('names a profile by display name and handle, and uses the avatar as the card image', () => {
    const meta = buildPageMeta({ profile, route: resolveRoute('/u/rin-sato'), siteUrl })

    expect(meta.title).toBe('Rin Sato (@rin-sato) | mrright.blog')
    expect(meta.description).toBe(profile.bio)
    expect(meta.image).toBe('https://mrright.blog/uploads/avatars/rin.png')
    expect(meta.ogType).toBe('profile')
    expect(meta.noindex).toBe(false)
  })

  it('falls back to a written description when a profile has no bio', () => {
    const meta = buildPageMeta({
      profile: { ...profile, bio: '' },
      route: resolveRoute('/u/rin-sato'),
      siteUrl,
    })

    expect(meta.description).toContain('Rin Sato')
    expect(meta.description).toContain('public profile')
  })

  it('will not advertise a profile the visitor or a moderator hid', () => {
    for (const hidden of [
      { ...profile, profilePublic: false },
      { ...profile, profileAdminDisabled: true },
    ]) {
      const meta = buildPageMeta({ profile: hidden, route: resolveRoute('/u/rin-sato'), siteUrl })

      expect(meta.noindex).toBe(true)
      expect(meta.canonical).toBe('')
      expect(meta.title).toBe(DEFAULT_TITLE)
      expect(meta.description).toBe(DEFAULT_DESCRIPTION)
    }
  })

  it('marks private and unknown routes noindex', () => {
    expect(buildPageMeta({ route: resolveRoute('/account'), siteUrl }).noindex).toBe(true)
    expect(buildPageMeta({ route: resolveRoute('/nope'), siteUrl }).noindex).toBe(true)
  })
})

describe('renderHead', () => {
  it('emits a canonical link for an indexable page', () => {
    const head = headFor(resolveRoute('/community'))

    expect(head).toContain('<link rel="canonical" href="https://mrright.blog/community" />')
    expect(head).toContain('<meta property="og:url" content="https://mrright.blog/community" />')
    expect(head).not.toContain('name="robots"')
  })

  // noindex and rel=canonical are contradictory instructions; the robots tag
  // wins and the link is dropped, but og:url stays because that is what a share
  // card links back to.
  it('drops the canonical link once a page is noindex, and keeps og:url', () => {
    const head = headFor(resolveRoute('/community/1755600000000-ab12cd'), { post: null })

    expect(head).toContain('<meta name="robots" content="noindex, follow" />')
    expect(head).not.toContain('rel="canonical"')
    expect(head).toContain('og:url')
  })

  it('mirrors the title and description into both card vocabularies', () => {
    const head = headFor(resolveRoute(`/community/${post.id}`), { post })

    expect(head).toContain('<meta property="og:title" content="Baking normals | mrright.blog Community" />')
    expect(head).toContain('<meta name="twitter:title" content="Baking normals | mrright.blog Community" />')
    expect(head).toContain(`<meta property="og:description" content="${post.message}" />`)
    expect(head).toContain(`<meta name="twitter:description" content="${post.message}" />`)
  })

  it('escapes user text instead of letting it close the attribute', () => {
    const head = headFor(resolveRoute(`/community/${post.id}`), {
      post: {
        ...post,
        message: '<script>alert(1)</script>',
        title: '" onload="alert(1)',
      },
    })

    // The text survives; what must not survive is the quote that would have
    // ended the content attribute and started a new one.
    expect(head).not.toContain('" onload=')
    expect(head).not.toContain('<script>')
    expect(head).toContain('&quot; onload=&quot;alert(1)')
    expect(head).toContain('&lt;script&gt;')
  })
})

describe('renderNoscript', () => {
  it('writes the post out for a crawler that runs no javascript', () => {
    const noscript = renderNoscript({ post, route: resolveRoute(`/community/${post.id}`) })

    expect(noscript).toContain('<h1>Baking normals</h1>')
    expect(noscript).toContain('Posted by Rin Sato')
    expect(noscript).toContain(post.message)
  })

  it('makes the community list crawlable without javascript', () => {
    const noscript = renderNoscript({
      posts: [
        { id: 'a-1', title: 'Monthly thread' },
        { id: 'b-2', title: 'Baking normals' },
      ],
      route: resolveRoute('/community'),
    })

    expect(noscript).toContain('<a href="/community/a-1">Monthly thread</a>')
    expect(noscript).toContain('<a href="/community/b-2">Baking normals</a>')
  })

  it('says nothing at all about a hidden profile', () => {
    expect(
      renderNoscript({
        profile: { ...profile, profilePublic: false },
        route: resolveRoute('/u/rin-sato'),
      }),
    ).toBe('')
  })

  it('escapes the text it writes', () => {
    const noscript = renderNoscript({
      post: { ...post, title: '<img src=x onerror=alert(1)>' },
      route: resolveRoute(`/community/${post.id}`),
    })

    expect(noscript).not.toContain('<img')
    expect(noscript).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('has nothing to add to the homepage', () => {
    expect(renderNoscript({ route: resolveRoute('/') })).toBe('')
  })
})

describe('injectSeo', () => {
  it('replaces the template head rather than adding a second one', () => {
    const html = renderSeoHtml({ post, route: resolveRoute(`/community/${post.id}`), siteUrl, template })

    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/name="description"/g)).toHaveLength(1)
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html).not.toContain('template default')
  })

  it('leaves the tags it does not own where they were', () => {
    const html = renderSeoHtml({ route: resolveRoute('/'), siteUrl, template })

    expect(html).toContain('<meta charset="UTF-8" />')
    expect(html).toContain('<link rel="icon" href="/favicon.svg" />')
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<html lang="en">')
  })

  it('puts the head inside <head> and the noscript inside <body>', () => {
    const html = renderSeoHtml({ post, route: resolveRoute(`/community/${post.id}`), siteUrl, template })

    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf('<body>'))
    expect(html.indexOf('<noscript>')).toBeLessThan(html.indexOf('</body>'))
  })

  // String.prototype.replace expands $&, $1 and friends in a string
  // replacement. A post titled "$&" would otherwise splice the matched text
  // back into the page.
  it('does not expand a dollar pattern that appears in user text', () => {
    const html = renderSeoHtml({
      post: { ...post, title: '$& $1 $` cost' },
      route: resolveRoute(`/community/${post.id}`),
      siteUrl,
      template,
    })

    expect(html).toContain('<title>$&amp; $1 $` cost | mrright.blog Community</title>')
  })

  it('still produces a head when the template has no head or body tags', () => {
    const html = renderSeoHtml({
      post,
      route: resolveRoute(`/community/${post.id}`),
      siteUrl,
      template: '<div id="root"></div>',
    })

    expect(html).toContain('<title>Baking normals | mrright.blog Community</title>')
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<noscript>')
  })
})

describe('injectSeo is idempotent', () => {
  it('re-rendering an already-rendered page does not stack duplicate tags', () => {
    const once = renderSeoHtml({ route: resolveRoute('/community'), siteUrl, template })
    const twice = injectSeo(once, {
      head: renderHead(buildPageMeta({ route: resolveRoute('/'), siteUrl })),
    })

    expect(twice.match(/<title>/g)).toHaveLength(1)
    expect(twice).toContain(`<title>${DEFAULT_TITLE}</title>`)
  })
})
