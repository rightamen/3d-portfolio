// Per-route <head> for a client-side-rendered site.
//
// Every URL used to be served the same dist/index.html, so every URL carried
// the homepage's title, description and og:image. Search engines that execute
// JavaScript eventually see the real page, but the ones that matter for a link
// preview -- Twitter/X, Discord, Slack, WeChat, Telegram, Facebook -- fetch the
// HTML once and never run a line of script. A community post shared into any of
// them showed "mrright.blog | 3D Portfolio" and a picture of a fire
// extinguisher.
//
// This module builds the head (and a <noscript> body for crawlers that do not
// run scripts) for a given path, and splices it into the built template. It is
// deliberately NOT React SSR: rendering the real component tree server-side
// would mean running three.js, drei and six lazy chunks in Node, and hydrating
// it would mean matching that output exactly. The head is where nearly all of
// the SEO value sits, and it costs one string rewrite per request.
//
// Pure by design -- the data comes in as arguments so the whole thing is unit
// testable without a server or a database (tests/unit/seo.spec.js).

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// Both attribute values and text nodes go through this. Escaping the quotes
// matters most: post titles and bios are user-written and land inside
// content="..." -- an unescaped double quote there is an attribute injection.
export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])

export const collapseWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

// Meta descriptions are cut around 160 characters by every engine that shows
// them, so cut here instead and end on a word rather than mid-syllable.
export const truncateText = (value, maxLength = 160) => {
  const text = collapseWhitespace(value)
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength - 1)
  const lastSpace = clipped.lastIndexOf(' ')
  const body = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped

  return `${body.replace(/[\s,.;:!?-]+$/, '')}…`
}

export const normalizeSiteUrl = (value) =>
  String(value || 'https://mrright.blog').trim().replace(/\/+$/, '')

export const absoluteUrl = (siteUrl, target) => {
  const value = String(target || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value

  return `${normalizeSiteUrl(siteUrl)}${value.startsWith('/') ? '' : '/'}${value}`
}

export const SITE_NAME = 'mrright.blog'
export const DEFAULT_TITLE = 'mrright.blog | 3D Portfolio'
export const DEFAULT_DESCRIPTION =
  'mrright.blog — an interactive 3D portfolio for Right’s characters, props, scenes, and ' +
  'realtime game art assets.'
export const DEFAULT_IMAGE = '/assets/projects/fire-extinguisher.png'

const COMMUNITY_DESCRIPTION =
  'Posts, questions and shared assets from the mrright.blog community — workflow notes, ' +
  'feedback threads and downloadable game art resources.'

// Post ids are `${Date.now()}-${base36}` (server/index.js createId). The
// pattern is loose on purpose: its job is to keep a crawler walking
// /community/<junk> from turning into a database lookup per request, not to
// validate the id.
const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
// Kept in step with handlePattern in server/index.js.
const HANDLE_PATTERN = /^[a-z0-9_-]{3,30}$/
// Same job as POST_ID_PATTERN: keep /projects/<junk> from costing a catalogue
// read per request. Deliberately looser than slugPattern in server/index.js
// (which validates slugs on the way in) so that a wrong-but-plausible slug
// reaches the lookup and gets an honest 404 instead of a soft one.
const PROJECT_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const PRIVATE_PREFIX_PATTERN = /^\/(?:admin|account|login)(?:\/|$)/

const decodeSegment = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Trailing slashes are stripped so /community/ and /community share one
// canonical URL; the root keeps its slash.
const normalizePathname = (pathname) => {
  const value = String(pathname || '/').split('?')[0].split('#')[0] || '/'
  if (value === '/') return '/'
  return value.replace(/\/+$/, '') || '/'
}

// What kind of page a path is, and which URL is the canonical one for it.
// Nested paths collapse onto their parent: the router mounts /u/:handle/* and
// /community/:id/* so tab state lives in the path, but the tabs are one page.
export const resolveRoute = (pathname) => {
  const path = normalizePathname(pathname)

  if (path === '/') return { canonicalPath: '/', kind: 'home' }
  if (path === '/community') return { canonicalPath: '/community', kind: 'community' }

  const postMatch = path.match(/^\/community\/([^/]+)/)
  if (postMatch) {
    const postId = decodeSegment(postMatch[1])
    if (!POST_ID_PATTERN.test(postId)) return { canonicalPath: null, kind: 'unknown' }
    return { canonicalPath: `/community/${postId}`, kind: 'post', postId }
  }

  // /projects is not a page of its own -- the catalogue lives on the homepage,
  // and the router renders the homepage here -- so it points its canonical at
  // `/` rather than becoming a second URL for the same content.
  if (path === '/projects') return { canonicalPath: '/', kind: 'home' }

  // Anchored, unlike the post and profile matches above: a project detail has
  // no tabs, so /projects/<slug>/anything is not a project page -- the client
  // router renders the plain homepage there, and this must agree with it.
  const projectMatch = path.match(/^\/projects\/([^/]+)$/)
  if (projectMatch) {
    const slug = decodeSegment(projectMatch[1])
    if (!PROJECT_SLUG_PATTERN.test(slug)) return { canonicalPath: null, kind: 'unknown' }
    return { canonicalPath: `/projects/${slug}`, kind: 'project', slug }
  }

  const profileMatch = path.match(/^\/u\/([^/]+)/)
  if (profileMatch) {
    const handle = decodeSegment(profileMatch[1]).trim().toLowerCase().replace(/^@+/, '')
    if (!HANDLE_PATTERN.test(handle)) return { canonicalPath: null, kind: 'unknown' }
    return { canonicalPath: `/u/${handle}`, kind: 'profile', handle }
  }

  if (PRIVATE_PREFIX_PATTERN.test(path)) return { canonicalPath: null, kind: 'private' }

  // The router renders the homepage for anything unmatched. That is a soft 404
  // as far as an index is concerned, so it gets noindex rather than a status
  // code -- the server does not know the client router's full route table, and
  // 404-ing a route the client added later would be worse than not indexing it.
  return { canonicalPath: null, kind: 'unknown' }
}

// Projects carry four columns per field (base, Zh, En, Ja) and the head is one
// language for everybody -- English, like the rest of this file and the
// lang="en" on the template. The base column is the fallback because a custom
// project created without translations only fills that one.
const englishField = (item, field) =>
  collapseWhitespace(item?.[`${field}En`]) || collapseWhitespace(item?.[field])

const projectTitle = (project) => englishField(project, 'title') || 'Project'

const postTitle = (post) => collapseWhitespace(post?.title) || 'Community post'

const authorName = (post) => collapseWhitespace(post?.user?.displayName)

const profileName = (profile) =>
  collapseWhitespace(profile?.displayName) || `@${collapseWhitespace(profile?.handle)}`

// One page's worth of head data. Rendering happens in renderHead so the shape
// stays assertable in tests without parsing HTML.
export const buildPageMeta = ({
  post = null,
  preload = [],
  profile = null,
  project = null,
  route,
  siteUrl,
} = {}) => {
  const site = normalizeSiteUrl(siteUrl)
  const kind = route?.kind || 'unknown'
  const canonical = route?.canonicalPath ? `${site}${route.canonicalPath}` : ''

  const base = {
    canonical,
    description: DEFAULT_DESCRIPTION,
    image: absoluteUrl(site, DEFAULT_IMAGE),
    noindex: !canonical,
    ogType: 'website',
    preload,
    properties: [],
    title: DEFAULT_TITLE,
  }

  if (kind === 'community') {
    return { ...base, description: COMMUNITY_DESCRIPTION, title: `Community | ${SITE_NAME}` }
  }

  if (kind === 'post') {
    // No post means the lookup found nothing or could not run. Either way there
    // is no content to advertise, so the page keeps a generic head and stays
    // out of the index.
    if (!post) {
      return { ...base, noindex: true, title: `Community | ${SITE_NAME}` }
    }

    const author = authorName(post)
    const properties = [['article:published_time', post.createdAt]]
    if (post.updatedAt) properties.push(['article:modified_time', post.updatedAt])
    if (author) properties.push(['article:author', author])
    if (post.topic) properties.push(['article:section', post.topic])

    return {
      ...base,
      description:
        truncateText(post.message) ||
        `A post in the ${SITE_NAME} community${author ? ` by ${author}` : ''}.`,
      // The post's own picture when it has one. Until round twenty-nine every
      // post shared into Twitter, Discord or WeChat carried the same photo of a
      // fire extinguisher, whatever the post was about.
      image: post.imageUrl ? absoluteUrl(site, post.imageUrl) : base.image,
      ogType: 'article',
      properties,
      title: `${postTitle(post)} | ${SITE_NAME} Community`,
    }
  }

  if (kind === 'project') {
    // No project means the slug named nothing, or the catalogue could not be
    // read. Same rule as posts: nothing to advertise, so keep the generic head
    // and stay out of the index.
    if (!project) return { ...base, noindex: true }

    const title = projectTitle(project)

    return {
      ...base,
      description:
        truncateText(englishField(project, 'summary')) ||
        `${title} — a game art asset on ${SITE_NAME}.`,
      // The one page type on this site that reliably has its own picture. Every
      // project has a render; this is what finally puts something other than
      // the fire extinguisher on a share card.
      image: project.image ? absoluteUrl(site, project.image) : base.image,
      title: `${title} | ${SITE_NAME}`,
    }
  }

  if (kind === 'profile') {
    // profilePublic false is a visitor's own choice and profileAdminDisabled is
    // a moderator's; neither should be advertised or indexed.
    if (!profile || profile.profilePublic === false || profile.profileAdminDisabled === true) {
      return { ...base, canonical: '', noindex: true }
    }

    const name = profileName(profile)
    const handle = collapseWhitespace(profile.handle)

    return {
      ...base,
      description:
        truncateText(profile.bio) ||
        `${name}’s public profile on ${SITE_NAME} — posts, shared resources and community ` +
          'activity.',
      image: profile.avatarUrl ? absoluteUrl(site, profile.avatarUrl) : base.image,
      ogType: 'profile',
      properties: handle ? [['profile:username', handle]] : [],
      title: `${name}${handle ? ` (@${handle})` : ''} | ${SITE_NAME}`,
    }
  }

  return base
}

// --- JSON-LD -----------------------------------------------------------------
//
// The tags above tell a scraper what to put on a card. This tells a search
// engine what the page *is*: a forum post with an author and a date, a person's
// profile, a piece of work with a picture and a creator. It is the difference
// between a blue link and a rich result.
//
// Round twenty-three left it out on the belief that CSP would block it -- this
// site's script-src is `'self' 'wasm-unsafe-eval'` with no inline allowance, and
// `ld+json` looks like an inline script. **That belief was wrong**, and it was
// measured rather than argued (round twenty-five, real Chromium, a CSP header
// with and without a matching sha256): a script element whose type is not a
// JavaScript type is a *data block*. The HTML parser never prepares it for
// execution, so the CSP check it would fail is never reached. No violation, no
// console error, contents readable either way.
//
// So there is no hash and no nonce here, and the CSP header is not touched. If
// a `script-src` violation report naming an inline script ever shows up at
// /api/csp-report, this is the paragraph to come back to.

// `<` is the one character that can end the script element early: a bio
// containing `</script>` would close it and everything after it would be parsed
// as HTML. Escaping it as \u003c keeps the JSON identical to a parser and inert
// to the HTML tokenizer. U+2028/2029 are legal JSON but not legal JavaScript
// string content, and cost nothing to escape.
const JSON_LD_ESCAPES = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export const encodeJsonLd = (value) =>
  JSON.stringify(value).replace(
    /[&<>\u2028\u2029]/g,
    (character) => JSON_LD_ESCAPES[character],
  )

// Undefined and empty values are dropped rather than emitted as null: a
// structured-data node with `"image": null` is worse than one without an image.
const node = (fields) =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false
      if (Array.isArray(value) && value.length === 0) return false
      return true
    }),
  )

const breadcrumb = (site, trail) =>
  node({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) =>
      node({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        item: `${site}${entry.path}`,
      }),
    ),
  })

// The site itself and the person behind it, repeated on every page that gets a
// graph at all. Repeating them is what lets each page stand on its own: a
// crawler that only ever fetches one URL still learns who published it.
const siteNodes = (site, owner) => {
  const websiteId = `${site}/#website`
  const personId = `${site}/#person`

  return [
    node({
      '@type': 'WebSite',
      '@id': websiteId,
      name: SITE_NAME,
      url: `${site}/`,
      description: DEFAULT_DESCRIPTION,
      inLanguage: 'en',
      publisher: owner ? { '@id': personId } : undefined,
    }),
    owner
      ? node({
          '@type': 'Person',
          '@id': personId,
          name: collapseWhitespace(owner.name),
          url: `${site}/`,
          jobTitle: collapseWhitespace(owner.titleEn || owner.title),
          // Profile links only. The mailto: in `socials` is deliberately not
          // republished here -- it is a personal address, and structured data
          // is the most machine-harvestable place on the page.
          sameAs: (owner.socials || [])
            .map((social) => String(social?.href || ''))
            .filter((href) => /^https:\/\//i.test(href)),
        })
      : null,
  ].filter(Boolean)
}

// The graph for one page, or null when there is nothing worth saying. Callers
// pass the same data they pass buildPageMeta, plus the site owner.
export const buildJsonLd = ({
  meta,
  owner = null,
  post = null,
  profile = null,
  project = null,
  route,
  siteUrl,
} = {}) => {
  const site = normalizeSiteUrl(siteUrl)
  const kind = route?.kind || 'unknown'

  // Nothing structured for a page we are asking not to be indexed -- private
  // areas, unknown paths, and rows that turned out not to exist.
  if (!meta || meta.noindex || !meta.canonical) return null

  const websiteId = `${site}/#website`
  const personId = `${site}/#person`
  const base = siteNodes(site, owner)

  if (kind === 'home') return base

  if (kind === 'community') {
    return [
      ...base,
      node({
        '@type': 'CollectionPage',
        '@id': `${meta.canonical}#page`,
        name: `${SITE_NAME} community`,
        url: meta.canonical,
        description: meta.description,
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
      }),
      breadcrumb(site, [
        { name: SITE_NAME, path: '/' },
        { name: 'Community', path: '/community' },
      ]),
    ]
  }

  if (kind === 'post' && post) {
    const author = authorName(post)
    const handle = collapseWhitespace(post?.user?.handle)

    return [
      ...base,
      node({
        // Google's forum type. A community post is a thread with an author and
        // replies, not an article by the site owner.
        '@type': 'DiscussionForumPosting',
        '@id': `${meta.canonical}#post`,
        headline: postTitle(post),
        text: collapseWhitespace(post.message),
        url: meta.canonical,
        datePublished: post.createdAt || undefined,
        dateModified: post.updatedAt || undefined,
        image: post.imageUrl ? absoluteUrl(site, post.imageUrl) : undefined,
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
        author: author
          ? node({
              '@type': 'Person',
              name: author,
              url: handle ? `${site}/u/${handle}` : undefined,
            })
          : undefined,
      }),
      breadcrumb(site, [
        { name: SITE_NAME, path: '/' },
        { name: 'Community', path: '/community' },
        { name: postTitle(post), path: route.canonicalPath },
      ]),
    ]
  }

  if (kind === 'project' && project) {
    const title = projectTitle(project)

    return [
      ...base,
      node({
        '@type': 'CreativeWork',
        '@id': `${meta.canonical}#work`,
        name: title,
        description: englishField(project, 'summary') || meta.description,
        url: meta.canonical,
        image: meta.image,
        dateCreated: project.year ? String(project.year) : undefined,
        keywords: (project.stack || []).map((item) => collapseWhitespace(item)).filter(Boolean),
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
        author: owner ? { '@id': personId } : undefined,
      }),
      breadcrumb(site, [
        { name: SITE_NAME, path: '/' },
        { name: title, path: route.canonicalPath },
      ]),
    ]
  }

  if (kind === 'profile' && profile) {
    const name = profileName(profile)
    const handle = collapseWhitespace(profile.handle)

    return [
      ...base,
      node({
        '@type': 'ProfilePage',
        '@id': `${meta.canonical}#profile`,
        url: meta.canonical,
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
        dateCreated: profile.joinedAt || undefined,
        mainEntity: node({
          '@type': 'Person',
          name,
          alternateName: handle ? `@${handle}` : undefined,
          description: collapseWhitespace(profile.bio),
          image: profile.avatarUrl ? absoluteUrl(site, profile.avatarUrl) : undefined,
          url: meta.canonical,
        }),
      }),
      breadcrumb(site, [
        { name: SITE_NAME, path: '/' },
        { name, path: route.canonicalPath },
      ]),
    ]
  }

  return base
}

export const renderJsonLdScript = (graph) => {
  if (!graph || graph.length === 0) return ''

  return `    <script type="application/ld+json">${encodeJsonLd({
    '@context': 'https://schema.org',
    '@graph': graph,
  })}</script>`
}

const metaTag = (attribute, key, value) =>
  `    <meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(value)}" />`

export const renderHead = (meta) => {
  const lines = [`    <title>${escapeHtml(meta.title)}</title>`]

  // Chunk hints, before the meta tags: a preload scanner reads top-down, and
  // these are the only lines in the head with a network cost attached. The
  // data-seo-preload marker is what lets injectSeo strip its own hints on a
  // re-render without touching the ones vite put in the template.
  for (const href of meta.preload || []) {
    lines.push(
      `    <link rel="modulepreload" crossorigin data-seo-preload href="${escapeHtml(href)}" />`,
    )
  }

  lines.push(metaTag('name', 'description', meta.description))
  // rel=canonical and noindex together are a contradiction -- the canonical
  // says "index this URL instead of its variants", the robots tag says "index
  // nothing here". Google's guidance is to pick one, so noindex wins and the
  // link is dropped. og:url stays: it is what a share card links back to, and
  // no crawler reads it as an indexing instruction.
  if (meta.noindex) lines.push(metaTag('name', 'robots', 'noindex, follow'))
  else if (meta.canonical) {
    lines.push(`    <link rel="canonical" href="${escapeHtml(meta.canonical)}" />`)
  }

  lines.push(metaTag('property', 'og:type', meta.ogType))
  lines.push(metaTag('property', 'og:site_name', SITE_NAME))
  lines.push(metaTag('property', 'og:title', meta.title))
  lines.push(metaTag('property', 'og:description', meta.description))
  if (meta.image) lines.push(metaTag('property', 'og:image', meta.image))
  if (meta.canonical) lines.push(metaTag('property', 'og:url', meta.canonical))

  for (const [key, value] of meta.properties || []) {
    if (value) lines.push(metaTag('property', key, value))
  }

  lines.push(metaTag('name', 'twitter:card', 'summary_large_image'))
  lines.push(metaTag('name', 'twitter:title', meta.title))
  lines.push(metaTag('name', 'twitter:description', meta.description))
  if (meta.image) lines.push(metaTag('name', 'twitter:image', meta.image))

  return lines.join('\n')
}

// Text for the crawlers that never run a script. Google does render the SPA, so
// this is not for Google -- it is for everything else, and it doubles as the
// only way /community's post list is discoverable without JavaScript.
export const renderNoscript = ({
  post = null,
  posts = [],
  profile = null,
  project = null,
  route,
} = {}) => {
  const kind = route?.kind || 'unknown'

  if (kind === 'project' && project) {
    const summary = englishField(project, 'summary')
    const format = englishField(project, 'format')

    return [
      '    <noscript>',
      '      <article>',
      `        <h1>${escapeHtml(projectTitle(project))}</h1>`,
      format ? `        <p>${escapeHtml(format)}</p>` : '',
      summary ? `        <p>${escapeHtml(summary)}</p>` : '',
      '        <p><a href="/">Back to the mrright.blog portfolio</a></p>',
      '      </article>',
      '    </noscript>',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (kind === 'post' && post) {
    const author = authorName(post)
    return [
      '    <noscript>',
      '      <article>',
      `        <h1>${escapeHtml(postTitle(post))}</h1>`,
      author ? `        <p>Posted by ${escapeHtml(author)}</p>` : '',
      post.imageUrl
        ? `        <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(postTitle(post))}" />`
        : '',
      `        <p>${escapeHtml(collapseWhitespace(post.message))}</p>`,
      '        <p><a href="/community">Back to the mrright.blog community</a></p>',
      '      </article>',
      '    </noscript>',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (kind === 'community' && posts.length > 0) {
    return [
      '    <noscript>',
      `      <h1>${escapeHtml(SITE_NAME)} community</h1>`,
      '      <ul>',
      ...posts.map(
        (item) =>
          `        <li><a href="/community/${escapeHtml(item.id)}">` +
          `${escapeHtml(postTitle(item))}</a></li>`,
      ),
      '      </ul>',
      '    </noscript>',
    ].join('\n')
  }

  if (kind === 'profile' && profile && profile.profilePublic !== false) {
    const name = profileName(profile)
    const bio = collapseWhitespace(profile.bio)
    const location = collapseWhitespace(profile.location)

    return [
      '    <noscript>',
      '      <section>',
      `        <h1>${escapeHtml(name)}</h1>`,
      profile.handle ? `        <p>@${escapeHtml(profile.handle)}</p>` : '',
      bio ? `        <p>${escapeHtml(bio)}</p>` : '',
      location ? `        <p>${escapeHtml(location)}</p>` : '',
      '      </section>',
      '    </noscript>',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

// The tags this module owns. Anything here is stripped out of the built
// template before the generated head goes in, so index.html keeps its
// hand-written defaults (they are what `vite preview` and a bare file open
// show) without them ending up duplicated at runtime.
const MANAGED_META_KEYS = new Set([
  'description',
  'og:description',
  'og:image',
  'og:site_name',
  'og:title',
  'og:type',
  'og:url',
  'robots',
  'twitter:card',
  'twitter:description',
  'twitter:image',
  'twitter:title',
])

const metaKeyOf = (tag) => {
  const match = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)
  return match ? match[1].trim().toLowerCase() : ''
}

export const injectSeo = (template, { head, jsonLd = '', noscript = '' }) => {
  let html = String(template)
    .replace(/[ \t]*<title>[\s\S]*?<\/title>\s*\n?/i, '')
    // Owned by this module like the managed meta tags: stripping it first is
    // what keeps a re-render from stacking a second graph onto the page.
    .replace(
      /[ \t]*<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*\n?/gi,
      '',
    )
    // Only the hints this module added: vite's own modulepreload for the entry
    // graph carries no such marker and has to survive.
    .replace(/[ \t]*<link\b[^>]*\bdata-seo-preload\b[^>]*>\s*\n?/gi, '')
    .replace(/[ \t]*<meta\b[^>]*>\s*\n?/gi, (tag) =>
      MANAGED_META_KEYS.has(metaKeyOf(tag)) ? '' : tag,
    )
    .replace(/[ \t]*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>\s*\n?/gi, '')

  // Function replacements throughout: the generated head carries user-written
  // text, and `$&` or `$1` in a post title would otherwise be expanded by
  // String.prototype.replace.
  // The graph goes in with the head, so one splice covers both and the hash in
  // the CSP header describes something that is actually on the page.
  const headBlock = jsonLd ? `${head}\n${jsonLd}` : head

  html = /<\/head>/i.test(html)
    ? html.replace(/([ \t]*)<\/head>/i, (_match, indent) => `${headBlock}\n${indent}</head>`)
    : `${headBlock}\n${html}`

  if (noscript) {
    html = /<\/body>/i.test(html)
      ? html.replace(/([ \t]*)<\/body>/i, (_match, indent) => `${noscript}\n${indent}</body>`)
      : `${html}\n${noscript}`
  }

  return html
}

// Convenience wrapper: everything above in one call, for the server route.
export const renderSeoHtml = ({
  owner,
  post,
  posts,
  preload,
  profile,
  project,
  route,
  siteUrl,
  template,
}) => {
  const meta = buildPageMeta({ post, preload, profile, project, route, siteUrl })

  return injectSeo(template, {
    head: renderHead(meta),
    jsonLd: renderJsonLdScript(
      buildJsonLd({ meta, owner, post, profile, project, route, siteUrl }),
    ),
    noscript: renderNoscript({ post, posts, profile, project, route }),
  })
}
