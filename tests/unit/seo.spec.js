import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  absoluteUrl,
  buildJsonLd,
  buildPageMeta,
  collapseWhitespace,
  escapeHtml,
  injectSeo,
  encodeJsonLd,
  renderHead,
  renderJsonLdScript,
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

const project = {
  format: '手绘风场景道具模型',
  formatEn: 'Hand-painted environment prop model',
  image: '/uploads/images/altar.png',
  slug: 'shadow-altar-candle-shrine',
  summary: '一款手绘风格的幻想祭坛壁饰模型。',
  summaryEn: 'A hand-painted fantasy altar prop featuring a stone arch and blue magical gems.',
  title: '暗影祭坛烛台',
  titleEn: 'Shadow Altar Candle Shrine',
}

const profile = {
  avatarUrl: '/uploads/avatars/rin.png',
  bio: 'Environment artist, mostly props.',
  displayName: 'Rin Sato',
  handle: 'rin-sato',
  location: 'Osaka',
  profilePublic: true,
}

// The static site owner, as server/content.js has it.
const owner = {
  name: 'Right',
  socials: [
    { href: 'https://github.com/rightamen', label: 'GitHub' },
    { href: 'mailto:someone@example.com', label: 'Email' },
  ],
  title: '三维模型与游戏美术资产创作者',
  titleEn: '3D model and game art asset creator',
}

const headFor = (route, data = {}) => renderHead(buildPageMeta({ route, siteUrl, ...data }))

const graphFor = (route, data = {}) =>
  buildJsonLd({
    meta: buildPageMeta({ route, siteUrl, ...data }),
    owner,
    route,
    siteUrl,
    ...data,
  })

const typesIn = (graph) => (graph || []).map((entry) => entry['@type'])
const nodeOfType = (graph, type) => (graph || []).find((entry) => entry['@type'] === type)

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
    expect(resolveRoute(`/projects/${project.slug}`)).toMatchObject({
      canonicalPath: `/projects/${project.slug}`,
      kind: 'project',
      slug: project.slug,
    })
  })

  it('points /projects at the homepage instead of making it a second url for it', () => {
    expect(resolveRoute('/projects')).toMatchObject({ canonicalPath: '/', kind: 'home' })
  })

  it('does not collapse a path below a project onto the project', () => {
    // Unlike posts and profiles, a project detail has no tabs. The client
    // router renders the plain homepage for /projects/<slug>/anything, so this
    // has to agree rather than serve that path a project's head.
    expect(resolveRoute(`/projects/${project.slug}/extra`).kind).toBe('unknown')
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
    expect(resolveRoute('/projects/' + 'a'.repeat(200)).kind).toBe('unknown')
    expect(resolveRoute('/projects/what is this').kind).toBe('unknown')
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

  it('uses the post\'s own picture as the card image when it has one', () => {
    const meta = buildPageMeta({
      post: { ...post, imageUrl: '/uploads/images/cover.png' },
      route: resolveRoute(`/community/${post.id}`),
      siteUrl,
    })

    expect(meta.image).toBe('https://mrright.blog/uploads/images/cover.png')
  })

  it('falls back to the site image for a post with no picture', () => {
    const meta = buildPageMeta({ post, route: resolveRoute(`/community/${post.id}`), siteUrl })

    expect(meta.image).toBe('https://mrright.blog/assets/projects/fire-extinguisher.png')
  })

  it('keeps a post that could not be loaded out of the index', () => {
    const meta = buildPageMeta({ post: null, route: resolveRoute('/community/gone'), siteUrl })

    expect(meta.noindex).toBe(true)
    expect(meta.title).toBe('Community | mrright.blog')
  })

  it('titles a project with its own title and gives it its own render as the card image', () => {
    const meta = buildPageMeta({ project, route: resolveRoute(`/projects/${project.slug}`), siteUrl })

    expect(meta.title).toBe('Shadow Altar Candle Shrine | mrright.blog')
    expect(meta.description).toBe(project.summaryEn)
    expect(meta.image).toBe('https://mrright.blog/uploads/images/altar.png')
    expect(meta.canonical).toBe(`https://mrright.blog/projects/${project.slug}`)
    expect(meta.noindex).toBe(false)
  })

  it('reads a project in English, the language the rest of the head is in', () => {
    const meta = buildPageMeta({ project, route: resolveRoute(`/projects/${project.slug}`), siteUrl })

    expect(meta.title).not.toContain(project.title)
    expect(meta.description).not.toContain(project.summary)
  })

  it('falls back to the untranslated columns of a project that has no English', () => {
    // A project created in the admin console without translations only has the
    // base title/summary filled in.
    const meta = buildPageMeta({
      project: { slug: 'bare', summary: 'Just the one column.', title: 'Bare project' },
      route: resolveRoute('/projects/bare'),
      siteUrl,
    })

    expect(meta.title).toBe('Bare project | mrright.blog')
    expect(meta.description).toBe('Just the one column.')
    expect(meta.image).toBe('https://mrright.blog/assets/projects/fire-extinguisher.png')
  })

  it('keeps a project that is missing or hidden out of the index', () => {
    // The store drops is_public = false rows, so a hidden project arrives here
    // as null exactly like a slug that names nothing.
    const meta = buildPageMeta({ project: null, route: resolveRoute('/projects/gone'), siteUrl })

    expect(meta.noindex).toBe(true)
    expect(meta.title).toBe(DEFAULT_TITLE)
    expect(meta.description).toBe(DEFAULT_DESCRIPTION)
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

  it('shows the post picture to a crawler that runs no javascript', () => {
    const noscript = renderNoscript({
      post: { ...post, imageUrl: '/uploads/images/cover.png' },
      route: resolveRoute(`/community/${post.id}`),
    })

    expect(noscript).toContain('<img src="/uploads/images/cover.png"')
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

  it('writes the project out, with a way back to the portfolio', () => {
    const noscript = renderNoscript({ project, route: resolveRoute(`/projects/${project.slug}`) })

    expect(noscript).toContain('<h1>Shadow Altar Candle Shrine</h1>')
    expect(noscript).toContain(project.summaryEn)
    expect(noscript).toContain(project.formatEn)
    expect(noscript).toContain('<a href="/">')
  })

  it('says nothing about a project that could not be loaded', () => {
    expect(renderNoscript({ project: null, route: resolveRoute('/projects/gone') })).toBe('')
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

  it('escapes an admin-written project title too', () => {
    const noscript = renderNoscript({
      project: { ...project, titleEn: 'Sword "Ash" & <b>rune</b>' },
      route: resolveRoute(`/projects/${project.slug}`),
    })

    expect(noscript).not.toContain('<b>')
    expect(noscript).toContain('Sword &quot;Ash&quot; &amp; &lt;b&gt;rune&lt;/b&gt;')
  })

  it('has nothing to add to the homepage', () => {
    expect(renderNoscript({ route: resolveRoute('/') })).toBe('')
  })
})

// JSON-LD is the one thing on the page that a search engine reads as a claim
// about what the page *is*. Two things are under test: does each route make the
// right claim, and can visitor-written text get out of the script element.
describe('buildJsonLd', () => {
  it('gives the homepage the site and the person behind it', () => {
    const graph = graphFor(resolveRoute('/'))

    expect(typesIn(graph)).toEqual(['WebSite', 'Person'])
    expect(nodeOfType(graph, 'WebSite')).toMatchObject({
      '@id': 'https://mrright.blog/#website',
      name: 'mrright.blog',
      publisher: { '@id': 'https://mrright.blog/#person' },
      url: 'https://mrright.blog/',
    })
    expect(nodeOfType(graph, 'Person')).toMatchObject({
      '@id': 'https://mrright.blog/#person',
      jobTitle: '3D model and game art asset creator',
      name: 'Right',
    })
  })

  // Structured data is the most machine-harvestable place on a page. The
  // address is already a mailto: link in the footer; republishing it here as a
  // typed field is a different thing, and not one this needs.
  it('publishes profile links but never the email address', () => {
    const person = nodeOfType(graphFor(resolveRoute('/')), 'Person')

    expect(person.sameAs).toEqual(['https://github.com/rightamen'])
    expect(JSON.stringify(person)).not.toContain('mailto:')
  })

  it('describes a project as a creative work with a trail back to the homepage', () => {
    const route = resolveRoute(`/projects/${project.slug}`)
    const graph = graphFor(route, { project: { ...project, stack: ['3ds Max', 'GLB'], year: '2026' } })
    const work = nodeOfType(graph, 'CreativeWork')

    expect(work).toMatchObject({
      '@id': `https://mrright.blog/projects/${project.slug}#work`,
      author: { '@id': 'https://mrright.blog/#person' },
      dateCreated: '2026',
      description: project.summaryEn,
      image: 'https://mrright.blog/uploads/images/altar.png',
      keywords: ['3ds Max', 'GLB'],
      name: 'Shadow Altar Candle Shrine',
      url: `https://mrright.blog/projects/${project.slug}`,
    })
    expect(nodeOfType(graph, 'BreadcrumbList').itemListElement).toEqual([
      { '@type': 'ListItem', item: 'https://mrright.blog/', name: 'mrright.blog', position: 1 },
      {
        '@type': 'ListItem',
        item: `https://mrright.blog/projects/${project.slug}`,
        name: 'Shadow Altar Candle Shrine',
        position: 2,
      },
    ])
  })

  it('puts the post picture in the graph as well as the card', () => {
    const route = resolveRoute(`/community/${post.id}`)
    const posting = nodeOfType(
      graphFor(route, { post: { ...post, imageUrl: '/uploads/images/cover.png' } }),
      'DiscussionForumPosting',
    )

    expect(posting.image).toBe('https://mrright.blog/uploads/images/cover.png')
  })

  it('describes a post as a forum posting with its author and dates', () => {
    const route = resolveRoute(`/community/${post.id}`)
    const posting = nodeOfType(graphFor(route, { post }), 'DiscussionForumPosting')

    expect(posting).toMatchObject({
      author: { '@type': 'Person', name: 'Rin Sato', url: 'https://mrright.blog/u/rin-sato' },
      datePublished: post.createdAt,
      dateModified: post.updatedAt,
      headline: 'Baking normals',
      text: post.message,
      url: `https://mrright.blog/community/${post.id}`,
    })
  })

  it('describes a public profile as a profile page about a person', () => {
    const graph = graphFor(resolveRoute('/u/rin-sato'), { profile })
    const page = nodeOfType(graph, 'ProfilePage')

    expect(page.mainEntity).toMatchObject({
      '@type': 'Person',
      alternateName: '@rin-sato',
      description: profile.bio,
      image: 'https://mrright.blog/uploads/avatars/rin.png',
      name: 'Rin Sato',
    })
  })

  it('leaves out what it does not have rather than emitting empty fields', () => {
    const graph = graphFor(resolveRoute('/u/rin-sato'), {
      profile: { ...profile, avatarUrl: '', bio: '' },
    })
    const person = nodeOfType(graph, 'ProfilePage').mainEntity

    expect(person).not.toHaveProperty('image')
    expect(person).not.toHaveProperty('description')
    expect(person.name).toBe('Rin Sato')
  })

  it('says nothing structured about a page it is asking not to be indexed', () => {
    // Private areas, unknown paths, and rows that turned out not to exist: if
    // the head says noindex, there is nothing to make claims about.
    expect(graphFor(resolveRoute('/account'))).toBeNull()
    expect(graphFor(resolveRoute('/no-such-page'))).toBeNull()
    expect(graphFor(resolveRoute('/community/gone'), { post: null })).toBeNull()
    expect(graphFor(resolveRoute('/projects/gone'), { project: null })).toBeNull()
    expect(
      graphFor(resolveRoute('/u/rin-sato'), { profile: { ...profile, profilePublic: false } }),
    ).toBeNull()
  })

  it('still describes the site when there is no owner record to draw on', () => {
    const graph = buildJsonLd({
      meta: buildPageMeta({ route: resolveRoute('/'), siteUrl }),
      route: resolveRoute('/'),
      siteUrl,
    })

    expect(typesIn(graph)).toEqual(['WebSite'])
    expect(nodeOfType(graph, 'WebSite')).not.toHaveProperty('publisher')
  })
})

describe('renderJsonLdScript', () => {
  // The one character that can end the script element early. A bio containing
  // </script> would otherwise close it, and everything after it would be parsed
  // as HTML by the browser. CSP is no help here -- a data block is never
  // checked against script-src (see the module comment) -- so this escaping is
  // the only thing standing between a visitor's bio and an injected element.
  it('cannot be broken out of by visitor-written text', () => {
    const script = renderJsonLdScript(
      graphFor(resolveRoute('/u/rin-sato'), {
        profile: { ...profile, bio: '</script><img src=x onerror=alert(1)>' },
      }),
    )

    expect(script).not.toContain('</script><img')
    expect(script.match(/<\/script>/g)).toHaveLength(1)
    expect(script).toContain('\\u003c/script\\u003e')
  })

  it('still parses back to the text that went in', () => {
    const encoded = encodeJsonLd({ bio: '</script> & <b>bold</b>' })

    expect(JSON.parse(encoded)).toEqual({ bio: '</script> & <b>bold</b>' })
  })

  it('has nothing to render for a page with no graph', () => {
    expect(renderJsonLdScript(null)).toBe('')
    expect(renderJsonLdScript([])).toBe('')
  })
})

describe('chunk preload hints', () => {
  it('announces the panel chunks it is given, marked as its own', () => {
    const head = renderHead(
      buildPageMeta({
        preload: ['/assets/ProjectDetail-abc.js'],
        project,
        route: resolveRoute(`/projects/${project.slug}`),
        siteUrl,
      }),
    )

    expect(head).toContain(
      '<link rel="modulepreload" crossorigin data-seo-preload ' +
        'href="/assets/ProjectDetail-abc.js" />',
    )
  })

  it('says nothing when there is nothing to announce', () => {
    expect(headFor(resolveRoute('/'))).not.toContain('modulepreload')
  })

  // The template's own modulepreload is vite's, for the entry graph. Stripping
  // that would cost every page the thing this feature is trying to buy.
  it('replaces its own hints on a re-render and leaves vite\'s alone', () => {
    const withPreload = [
      '<html><head>',
      '    <link rel="modulepreload" crossorigin href="/assets/react-vendor-x.js">',
      '  </head><body></body></html>',
    ].join('\n')

    const once = renderSeoHtml({
      preload: ['/assets/ProjectDetail-abc.js'],
      project,
      route: resolveRoute(`/projects/${project.slug}`),
      siteUrl,
      template: withPreload,
    })
    const twice = injectSeo(once, {
      head: renderHead(
        buildPageMeta({ preload: ['/assets/ProjectDetail-def.js'], route: resolveRoute('/'), siteUrl }),
      ),
    })

    expect(twice).toContain('href="/assets/react-vendor-x.js"')
    expect(twice).toContain('href="/assets/ProjectDetail-def.js"')
    expect(twice).not.toContain('ProjectDetail-abc')
    expect(twice.match(/data-seo-preload/g)).toHaveLength(1)
  })
})

describe('renderSeoHtml puts the graph on the page', () => {
  it('emits one graph, inside the head', () => {
    const html = renderSeoHtml({ owner, route: resolveRoute('/'), siteUrl, template })

    expect(html.match(/application\/ld\+json/g)).toHaveLength(1)
    expect(html.indexOf('application/ld+json')).toBeLessThan(html.indexOf('</head>'))
    expect(JSON.parse(html.match(/ld\+json">([\s\S]*?)<\/script>/)[1])['@context']).toBe(
      'https://schema.org',
    )
  })

  it('leaves the page without one when the page is not indexed', () => {
    const html = renderSeoHtml({ owner, route: resolveRoute('/account'), siteUrl, template })

    expect(html).not.toContain('ld+json')
    expect(html).toContain('name="robots"')
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

  // The graph is owned by this module too, so a second pass replaces it rather
  // than leaving two graphs on the page for a crawler to reconcile.
  it('does not stack a second json-ld graph', () => {
    const once = renderSeoHtml({ owner, route: resolveRoute('/community'), siteUrl, template })
    expect(once.match(/application\/ld\+json/g)).toHaveLength(1)

    const twice = injectSeo(once, { head: '', jsonLd: '    <script type="application/ld+json">{}</script>' })

    expect(twice.match(/application\/ld\+json/g)).toHaveLength(1)
    expect(twice).toContain('>{}</script>')
  })
})
