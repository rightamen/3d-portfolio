# ADR: Web SEO Rendering Strategy

Date: 2026-08-22

Status: Accepted

## 1. Background

mrright.blog is a client-rendered React app. Until this decision, every URL was
answered with the same built `dist/index.html`: the same `<title>`, the same
`<meta name="description">`, the same `og:image`. The page content appeared only
after the bundle ran.

That is fine for a visitor and fine for Googlebot, which renders JavaScript. It
is not fine for anything else:

- **Link previews.** Twitter/X, Discord, Slack, Facebook, Telegram and WeChat
  fetch the HTML once and never execute a script. A community post shared into
  any of them showed "mrright.blog | 3D Portfolio" and a photograph of a fire
  extinguisher, whatever the post was about.
- **Discovery.** `/community/:id` and `/u/:handle` were reachable only by
  running the app. `sitemap.xml` listed neither, so a crawler had no path to a
  single post.
- **Duplicate URLs.** No page declared a canonical URL, and the sitemap listed
  four `/?project=<slug>` entries that nothing in the client reads — four
  advertised duplicates of `/`.

`PROJECT_PROGRESS.md` carried this as roadmap item 6, "SSR / 预渲染 SEO".

## 2. Options

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Leave it | No work, no risk | Every shared link misrepresents its page; posts and profiles are undiscoverable | Rejected |
| Full React SSR (`renderToString` + `hydrateRoot`) | Real content in the first response; best possible result | The tree pulls in three.js, `@react-three/fiber` and drei, none of which run in Node without work; six lazy chunks would have to resolve server-side; a hydration mismatch on the homepage breaks the 3D scene rather than degrading it | Rejected for now |
| Build-time prerendering of every route | No per-request cost | Posts and profiles are database rows written by visitors; a build-time snapshot is stale the moment someone posts | Rejected |
| A prerender service (Prerender.io, Rendertron) for bot user agents | No app change | Adds an external dependency and a second rendering path that nobody exercises; user-agent sniffing is fragile and is cloaking if the two paths ever disagree | Rejected |
| Server-side `<head>` injection, plus a `<noscript>` body | Nearly all the SEO and preview value; one string rewrite per request; no React in Node; no hydration risk at all | The visible page is still client-rendered, so a crawler that runs no JavaScript sees the `<noscript>` text rather than the real layout | **Accepted** |

## 3. Decision

`server/seo.js` builds the head for a path and splices it into the built
template. The Express catch-all — the one that used to `sendFile` the template
untouched — resolves the route, loads the row it names, and sends the rewritten
HTML.

- Routes covered: `/`, `/community`, `/community/:id`, `/u/:handle`. Nested
  paths (`/u/:handle/posts`, `/community/:id/comments`) collapse onto the parent
  as the canonical URL, because the tabs are one page.
- Every indexable page gets a title, a description, `og:*`, `twitter:*` and a
  `rel=canonical`.
- `/admin`, `/account`, `/login` and any unmatched path get
  `robots: noindex, follow` and no canonical link. Unmatched paths still answer
  200 and render the homepage: the server does not know the client router's
  route table, and 404-ing a route the client added later would be worse than
  not indexing it.
- A missing post, or a handle nobody owns, answers a real 404 — the lookup
  positively said so. A store that is absent or throwing does **not**: a
  database blip must not turn a live post into a 404 a crawler remembers.
- A profile with `profilePublic: false` or `profileAdminDisabled` gets the
  default head and `noindex`. Its display name and bio never reach the HTML.
- `<noscript>` carries the post body, the profile summary, or the community post
  list. The list is the only way `/community`'s posts are reachable without
  JavaScript.
- `sitemap.xml` lists `/`, `/community` and one entry per community post with a
  `lastmod`. Public profiles stay out of it: enumerating them is exactly what
  `/api/users/:handle` is written to prevent. They remain indexable when linked.

## 4. Consequences

- Two extra database reads exist on the HTML path: one per `/community/:id` and
  `/u/:handle` request. Both are single indexed lookups. The `/community` post
  list and the sitemap are cached in process for 60s and 5min respectively,
  since they are anonymous and identical for every caller.
- `express.static` is mounted with `index: false` so `/` falls through to the
  handler instead of being answered with the unmodified template.
- The template is re-read only when its mtime changes.
- Escaping is load-bearing. Post titles, bodies, display names and bios are
  visitor-written and land inside `content="..."`; `server/seo.js` escapes
  `& < > " '` on every value, and every `String.replace` uses a function
  replacement so a `$&` in a post title is not expanded into the page.
- No JSON-LD. `<script type="application/ld+json">` is a script element as far
  as CSP is concerned, and this site's `script-src` is `'self'
  'wasm-unsafe-eval'` with no inline allowance. Adding it means either a
  per-response hash spliced into the CSP header or a policy relaxation, and
  neither is worth it before the plain tags are proven.

## 5. Verification

- `tests/unit/seo.spec.js` — 37 cases over the pure builders: route resolution,
  per-kind heads, hidden-profile suppression, escaping, `$&` expansion,
  idempotent injection.
- `tests/api/contract.spec.js` — the DB-free HTML cases against a real server:
  homepage and community heads, one title only, `noindex` on the private areas,
  `no-store`, hashed assets still `immutable`, robots.txt, sitemap shape.
- `tests/api/contract.db.spec.js` — the cases that need real rows: a post's
  head and `<noscript>`, canonicalisation of a tab path, 404 for a missing post
  and an unowned handle, a public profile's head, and a profile going private
  taking its head off the page.

## 6. What would change this decision

If the site grows content where the rendered layout itself matters to ranking —
long-form articles, documentation — full SSR for those routes only becomes worth
the cost. The router is already declarative, which is the hard prerequisite. The
homepage should stay client-rendered regardless; there is nothing in a 3D scene
for an index to read.

## 7. Amendment, 2026-08-26: projects have a route

The original decision left one gap open, and §1 named it: the sitemap's four
`/?project=<slug>` entries were removed because nothing read that parameter, and
the projects themselves were left covered by `/` alone. So the four pieces of
work this site exists to show could not be linked to, shared, or indexed
separately — the detail panel was React state with no address.

They now have one: `/projects/:slug`.

- `src/App.jsx` renders the **same** `homePage` element for `/` and
  `/projects/:slug`. The detail is an overlay on the homepage, not a separate
  page, and rendering the same element keeps `HomePage` — and the 3D scene
  inside it — mounted across the navigation.
- `src/sections/Projects.jsx` reads the open project from the URL
  (`useMatch('/projects/:slug')`) instead of holding it in state, and the card's
  "view details" control is a real `<Link>`. That link is also what lets a
  crawler walk from the homepage into each project.
- `resolveRoute` matches `/projects/:slug` **anchored**, unlike the post and
  profile routes: a project detail has no tabs, so `/projects/<slug>/anything`
  is not a project page, and the client router agrees — it renders the plain
  homepage there.
- `/projects` is not a page. It renders the homepage and points its canonical at
  `/`, rather than becoming a second URL for the same content.
- A slug that names nothing answers 404, exactly like a missing post. So does a
  project whose `is_public` is false: `projectStore.listProjects` drops those
  rows, so a hidden project is indistinguishable from a missing one here, which
  is the behaviour we want — unpublishing has to take the head off the page.
- Project text is read in English (`titleEn`/`summaryEn`, falling back to the
  base column), like the rest of the head and the template's `lang="en"`.
- Projects are the first pages on this site with a **picture of their own**:
  `og:image` is the project's render instead of the site-wide fire extinguisher.
- `sitemap.xml` lists every public project under its own URL.

Verification added: 14 cases in `tests/unit/seo.spec.js`, 6 in
`tests/api/contract.spec.js` (projects come from the bundled content file, so
the DB-free suite reaches them), 5 in `tests/api/contract.db.spec.js` (a real
admin-created project, including hiding it), and 5 in
`tests/e2e/site-routing.spec.js` (link, cold load, close, Back, unknown slug).

What this amendment does **not** change: still no SSR, still no JSON-LD, and a
project's share card is its existing render — there is no per-project social
image.
