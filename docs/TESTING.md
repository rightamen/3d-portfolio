# What each check can see, and what it cannot

Status: written 2026-09-10, after a bug shipped past a suite that was green.

There are seventeen `npm run test:*` / `check:*` commands in this repository and
nothing said what any of them was **for**. That is not a documentation gap; it is
how a bug ships. On 2026-09-10 `npm run test:notifications` reported 23 green
checks and the notification label was blank on every notification on the site —
because that suite exercises SQL and **cannot see a missing translation key**.
Green meant "the queries are right", and it was read as "notifications work".

So the column that matters below is the second one.

## The suites

| Command | Proves | Structurally cannot see |
| --- | --- | --- |
| `test:unit` | Pure logic: i18n resolution, SEO routes, themes, payment info, image profiles, crop arithmetic, profile bounds, admin nav. Fast, no I/O. | Anything that needs a database, a browser, or a request. A function can be perfect and never be called. |
| `test:api` | The HTTP contract against a server with **no** database — envelope shape, error codes, auth refusals. | Anything that needs stored rows: entitlement, orders, notifications, publishing. |
| `test:api:db` | The same contract against a **disposable PostgreSQL**: register → verify → publish → order → download plus order concurrency/rollback, 240 checks, including social consent, reports, folder ownership, creator analytics, private favorites, theme isolation and targeted admin/mobile-user exhibition journeys. | Most UI behavior and visual quality; the two exhibition journeys exercise only their paths. Pair with marketplace UI and notification journey checks. |
| `test:marketplace-ui` | The built frontend in local Chromium with controlled API responses: independent homepage loading, empty/error/loading states, order snapshot amounts, closed orders, session recovery, stale account responses, translated category filters, and mobile overflow. Run `npm run build` first. | Real API authorization and SQL. Its responses are fixtures; pair it with `test:api:db` and the real notification journey. |
| `test:schema-migration` | That `ensureSchema()` migrates an **existing** database, not just builds an empty one — the path production actually takes — and that it is idempotent. | Whether the new columns are ever read or written by anything. |
| `test:notifications` | The notification queries: who counts as unread, that marking read is per-person, that unpublishing empties every inbox, that one account cannot delete another's notice. | **The UI entirely.** A missing i18n key, a bell that never polls, a badge that never clears. This is the gap that shipped. |
| `test:notification-journey` | The whole chain in a real browser: a throwaway cluster, the real server, the real built frontend, **two accounts in two separate browser contexts**, a real price, a real click. | Anything not on that one path. It is one journey, not coverage. |
| `test:e2e` | Site routing, the admin console, admin visitor management, and a production smoke test, in a browser. | Server-side rules a browser never reaches. |
| `test:openapi` | That `docs/openapi/api-v1.yaml`'s error-code enum matches the server's actual codes. | Whether any route matches its documented shape. |
| `test:content-health` | The content-health checker, by handing it each failure on purpose. A checker nobody has fed a failure to is a checker that reports green either way. | Whether the site has any of those problems right now. |
| `test:admin-totp` | The hand-written TOTP against the standard, not against itself. A self-consistent implementation that generates and verifies its own wrong codes passes every self-test. | Everything else about admin auth. |
| `test:release` | Real disposable Git repositories, fresh build and tar: dirty/untracked/concurrently changed source refusal, exact Git manifest, SHA-256, upload/env exclusion, unpushed commit refusal and remote corruption gate (8 scenarios). No network to the VPS. | Production disk state, database backups, real SSH and service replacement. |
| `test:deploy-backup` | The deploy's hardlink-and-delete logic against a real filesystem, in a scratch directory. | Whether the real `/opt` is in the state it assumes. |
| `test:deploy-script` | `bash -n` over the remote half of the deploy. The remote half is the part with no undo: by the time bash reports a syntax error, the env file is backed up and the service is restarting. | Whether the commands are *right* — only that they parse. |
| `check:production` | The live site from outside over real TLS, **including the certificate**, which nothing else checks. It exists because the certificate expired on 2026-09-04 and every visitor got a browser warning. | Anything behind a login. |

2026-10-31: the local marketplace browser suite has 22 cases, including manual
and reconnect-driven session recovery, confirmed expiry, account switching,
login/logout, category persistence and three-language labels.

## Rules that follow from the table

2026-10-30: `test:api:db` now runs **203 checks**. Seven in
`tests/api/orders-store.db.spec.js` additionally exercise concurrent order
creation, cancellation blocked behind a real row lock, serialized settlement
history, duplicate confirmation, and rollback after deliberately failed audit
inserts. They use only the disposable database provisioned by the runner.

1. **A green suite answers its own question, not yours.** Before trusting a
   green, name what it exercises. "The queries are right" is not "the feature
   works".
2. **If a change spans layers, it needs a check that spans layers.** A
   notification is a database row, a route, a poll, a badge and a translated
   string. Four of those five were tested and the fifth was the broken one.
3. **A walk-through needs two people, driven separately.** Round 46's
   stranger-journey walk was supposed to catch the missing seller notification
   and did not, because one operator held both accounts — and therefore always
   already knew. `test:notification-journey` uses two browser contexts for
   exactly this reason.
4. **Wait for the thing, never for a duration.** The panel assertion in the
   journey read its text straight after the click, passed once by luck and then
   failed. Passing by luck is worse than failing every time.
5. **A probe bug looks exactly like a product bug.** The journey's first two
   failures were mine — the first `.primary-action` on a work page is not the
   buy button, and `PUT /api/account/works/:id` is a `PATCH`. Both made the
   work stay free and no order happen, which reads as "ordering is broken".
   Check the probe before changing the product.

## What still has no automated check

Named because an unwritten gap is indistinguishable from a covered one:

- The crop dialog, the account settings editor and the works panel are verified
  by hand with a stubbed session, not by anything that runs on its own.
- Email delivery. `emailDelivery.js` reports success from the API response,
  which is not the same as arrival (see the Resend notes in the operations
  docs).
- Every visual judgement. Layout, density and contrast are measured ad hoc in a
  browser and recorded in `PROJECT_PROGRESS.md`, not asserted anywhere.

2026-10-31 spatial UI update: test:marketplace-ui now has 26 cases, adding
keyboard/button work selection, grid/spatial switching without refetch, WebGL
fallback, and isolation of one failed texture. Actual pointer rotation and wheel
zoom were additionally checked in the local public design preview.


2026-10-31 atelier UI update: test:marketplace-ui now has 28 passing cases.
Two additional regressions cover immersive view initial focus, Tab trapping,
Escape focus restoration and body scroll unlock, including navigation from the
immersive view to work details. The shared dialog helper now preserves its
initial focus target when that target is also the original trigger. Actual
hover/click interactions and desktop/390px zh-CN/en/ja immersive layouts were
also checked in the read-only public design preview; these do not establish
real server authorization or native model rendering.


2026-11-01 lighting UI update: test:marketplace-ui has 30 passing cases.
New checks cover lighting selection across image/3D mode changes without
replacing the canvas or changing the selected work, and keyboard navigation
through 12 thumbnails on a narrow phone with the selected item fully visible
without scrolling the page. Public preview checks additionally confirm actual
canvas pixel changes between lighting presets, and three-language portrait
and landscape immersive layouts. These checks use public covers, not native
source-model geometry.


2026-11-01 infinite exhibition update: the full marketplace UI suite passed
33 cases. Three new cases cover pointer direction and settling on leave,
bounded tile counts and one catalogue request, reduced-motion opt-out,
keyboard/reset/grid/category behavior, and drag-versus-navigation semantics.
Existing homepage layout assertions now target the default infinite view.
After the mobile row arrangement adjustment, all three wall cases passed
again. Read-only public preview checks additionally exercised long-distance
wrapping, real touch pointer events and native artwork link navigation;
one final batch encountered a transient public-data connection failure and
its touch check passed separately after the endpoint recovered. Screenshots
cover zh-CN/en/ja at 390px. These are cover-browsing checks, not source-model
rendering or server authorization tests.


2026-11-01 exhibition effects update: the existing 33 browser cases passed.
A 34th case verifies pointer illumination and a live reduced-motion change;
it passed separately after setting its desktop viewport explicitly to keep
the simulated pointer inside the screen. Product code was unchanged between
those runs. Design QA additionally confirms actual pixel changes, perspective
transforms, click-through navigation and zh/en/ja touch dragging. The public
catalogue was read once and replayed for those design checks. Pure-logic unit
tests were not repeated for this CSS/pointer-effect update.


2026-11-01 curated exhibition update: 214 disposable-database checks and 38
marketplace browser regressions passed. Eleven DB cases cover real ratings,
curator admission, duplicate/concurrent replacement, verified-account and
self-vote restrictions, raw-average thresholds, withdrawn recommendations,
content-version invalidation, forged creator fields, atomic asset rollback,
and real admin/mobile-user browser journeys. New UI checks exclude ordinary
works, distinguish both sources, prevent catalogue fallback, and prevent a
rating for a version newer than the content visible on the page. Three
admission checks passed again after final empty-state control cleanup.
The migration checker now seeds an existing work and confirms it remains
unscored and unrecommended after the upgrade; repeat initialization passed.
The local public preview is read-only and uses the old live API, so it has no
new rating records. Synthetic scores used in layout screenshots are test-only.


2026-11-01 release verification: source commit c6d3334 and fixed tag
release-2026-11-01 were pushed before deployment. Production checks confirm
174 shipped file hashes, unchanged env/systemd/nginx and 13 upload hashes,
health/admin summary/curation metadata and nine public routes. Real Chromium
desktop and 390px smoke checks passed with no page errors. TLS checks had
14 passes, zero failures and two legacy /projects/ sitemap warnings; the
actual /w/ detail route was checked separately. No ratings or curator choices
were seeded in production. See RELEASE_2026-11-01.md for backup locations.


2026-11-01 documentation checkpoint: GET-only production follow-up also
confirmed /w/mrright/md-leimu 200, its legacy /projects/md-leimu 301 target,
non-empty catalogue thumbnails, absence of private payment fields in public
works and email/internalId in public creator data, and 401 for all four
anonymous notification/announcement endpoints. No code suites were repeated
for this documentation-only checkpoint. Next steps are in
HANDOFF_2026-11-01.md.


2026-11-01 creator studio update: build/lint, 348 unit checks and all 46
marketplace browser cases passed. Eight new creator-page regressions cover
pointer movement with bounded pooling, persistent views across tabs,
server-side creator/category pagination, preserving loaded works on failure,
retrying the same page, exposing all 48 loaded works in the looping pool,
activity failures independent of the gallery, private-profile/activity
boundaries, profile retry, three-language mobile keyboard use and isolation
of late responses/theme tokens when navigating between creators. Visual QA
used real public works read-only at 1440px and 390px in zh/en/ja, including
real touch input; no overflow or page exceptions were seen. These checks do
not validate production authorization or native model geometry. No server,
API or schema changes were made. See CREATOR_STUDIO_2026-11-01.md.


2026-11-01 theme expansion: build/lint, 351 unit tests, the full 55-case
marketplace browser suite and 215 disposable-database cases passed. Nine
new browser cases verify all ten temporary public trials with zero saves,
restoring the creator palette, draft preview before explicit save, reload
persistence and propagation to real profile/detail components, default/reset
and discard semantics, invalid contrast, failed save/load recovery, zh/en/ja
phone layouts, language changes without losing a draft, and ignoring a late
save response after session replacement. Unit checks also cover light/dark
text contrast and reject inherited object-property names as theme choices.
The new DB case saves all ten presets, reads them back from the account and
public profile APIs, and checks another verified account remains unchanged.
After final comment/rating palette cleanup, build/lint and 17 relevant theme
and creator-page browser cases passed again, including the old white-text
notice, timeline, contact and comment metadata regressions. ResizeObserver
layout is now awaited before counting the bounded pool, rather than using the
initial zero-size layout. Real public artwork preview screenshots covered ten
desktop palettes and selected phone variants with no overflow or page errors.
No schema changes or production writes occurred; the disposable cluster was
cleaned up. Theme preview on port 5174 remains read-only. See
CREATOR_THEMES_2026-11-01.md.


2026-11-01 profile scroll effects: build/lint, 351 unit checks and the full
58-case marketplace browser suite passed. Three additional cases exercise
actual banner movement, sticky navigation boundaries and progress, returning
to the top with focus restoration, once-only entrance animations, fully
visible keyboard-focused forms, a live reduced-motion change and a true
coarse-pointer mobile context. Real public artwork checks also exercised
dark/light palettes and 390px layout with zero page errors or overflow.
The wall itself is not transformed by scrolling. No API/schema or server
changes were made; database suites were not repeated for this visual change.
See CREATOR_SCROLL_2026-11-01.md and .deploy-tools/scroll-ui/.


2026-11-01 public module effects: build/lint, 351 unit checks and all 63
marketplace browser cases passed. Five new checks cover late lazy/data
content without extra catalogue requests, keeping canvases/walls and purchase
controls outside reveal transforms, delegated pointer lighting and click
navigation across explore/work/community routes, cleanup on route changes,
live reduced-motion cancellation and readable filtered cards, account/login
form stability in separate browser contexts, and real coarse-pointer mobile
layout. The old card hover lift is now disabled under reduced motion too.
Read-only public design checks covered home/explore/community on desktop and
home/explore/community/login at 390px with no overflow or page exceptions.
No API/schema/server changes or database writes were made; DB suites were
not repeated. See MODULE_EFFECTS_2026-11-01.md and .deploy-tools/modules-ui/.


2026-11-01 studio production release: source 765242f and fixed tag
release-2026-11-01-studio were pushed before packaging/deployment. All 176 shipped
file hashes matched, config hashes and 13 uploads were preserved, and stored
account themes were unchanged. Health/admin summary/admin works, nine public
routes, ten trilingual presets, legacy 301, privacy/thumbnail and anonymous
401 checks passed. Real Chromium desktop and six 390px mobile routes passed
with zero page exceptions or overflow, including profile theme trial/restore,
wall, sticky navigation/back-top and module effects. No production theme save,
rating, order or announcement was created; temporary admin sessions were
revoked. This documentation update did not rerun code checks or redeploy.
See RELEASE_2026-11-01_STUDIO.md for artifact and rollback references.

2026-11-06 release tooling: build/lint, all 354 unit tests, 8 disposable release
scenarios, deploy-script and deploy-backup checks passed. The read-only production
checker now discovers canonical /w/:handle/:slug URLs and checks real work titles
and JSON-LD, plus the exact legacy 301 Location; account works, explore and creator
routes are included. The real HTTPS run returned 22 passes, zero warnings/failures.
This tooling change did not deploy application code or modify production data.

2026-11-06 creator console and bookmarks: build/lint, 354 unit checks, the
existing-database migration/idempotency runner, all 224 disposable-database API
checks and all 72 marketplace browser checks passed. Nine new DB cases cover
visitor auth, concurrent idempotent saves, account isolation, unavailable-work
redaction, pagination, current-version ratings, multi-currency paid-only totals,
zero-filled UTC series, a non-UTC PostgreSQL session, and real mobile save/remove
and creator-dashboard journeys. Nine new browser cases cover retry, keyboard
save/remove, late old-account reports, final-page removal, zh/en/ja mobile layouts,
accessible daily data and anonymous gating. Theme/marketplace fixtures now also
model the new private favorite-state read. Screenshot figures are controlled test
data. Production has not been migrated or deployed by this feature work.

2026-11-07 creator release: the fixed clean c113caf artifact is live. Preflight
build/lint, release-artifact, remote-script and backup checks passed; prior
354 unit / 224 disposable DB / 72 UI checks cover the unchanged product source.
All 181 shipped files, 13 original uploads, config and eight existing business
table fingerprints match. Real verified HTTPS checks returned 22 passes with no
warnings, 11 public pages returned 200 and seven anonymous private reads returned
401. Real short-lived creator sessions exercised analytics, favorites, favorite
state, strict v1 and desktop/390px touch UI. Zero page errors and overflow; no
production favorites/orders/ratings written. Temporary admin and visitor sessions
were revoked, private credential files removed. Full release/backups and probe
waiting correction: RELEASE_2026-11-07_CREATOR.md.

2026-11-07 interface/workspace update: final build/lint, all 358 unit checks,
225 disposable-database checks and all 83 marketplace browser checks passed.
Four new unit checks cover preference normalization, every light/dark palette
and accent edge against contrast bounds, live system palette resolution and
reduced-motion priority. Eleven additional browser cases cover all eight
interface choices, persistence/reset, cross-route styling without author-theme
writes, system media changes, the fixed creator sidebar, 1280/1440px overflow,
galaxy navigation and performance-section focus, mobile drawer focus/search/scroll
locking, three-language phone settings, static mode across public/private routes,
storage-event recovery and denied persistence, and admin sign-in. The real admin
system-settings journey runs against existing authentication and a disposable DB.
Independent Chromium/SwiftShader QA verified an actual WebGL canvas and changed
orbit after dragging with no page exceptions; fallback screenshots alone would
not prove this. Desktop and phone dark/light screenshots were inspected. The old
bookmark keyboard test now waits for an enabled button before focus/Enter, and
settings screenshots wait for lazy content and finish finite animations.
Settings are device-local, not account-synchronized. No server/schema/API change,
production SQL or deployment occurred. See INTERFACE_WORKSPACE_2026-11-07.md.

2026-11-07 interface production release: the clean 70697f7 artifact and fixed
release-2026-11-07-interface tag are live. Preflight build/lint, eight artifact
scenarios, deploy-script and backup checks passed. All 182 release files,
13 uploads, environment/nginx/systemd hashes and nine business-table fingerprints
match before/after deployment and after UI verification. Real verified HTTPS
returned 22 passes with no warnings; 14 pages returned 200 and seven anonymous
private routes returned 401. Real short-lived creator sessions exercised API
metrics, desktop/390px workspace, actual WebGL orbit dragging, favorites reads,
light appearance/accent, motion controls, reload persistence and mobile drawer.
No page errors or overflow. No production favorite, author-theme, order or rating
writes; temporary visitor/admin sessions were revoked and credential files removed.
See RELEASE_2026-11-07_INTERFACE.md for backup paths, source and evidence.

2026-11-07 social/folders update: final build/lint, 362 unit checks, all 240
full disposable-database checks, all 94 marketplace browser cases and the
existing-schema migration/idempotency runner passed. Four new unit cases bound
malformed folder/report metadata, allowed categories, useful Other details and
markup-as-text. Fifteen new DB cases cover visitor/admin auth, concurrent
idempotent follows, explicit receiver consent (including crossed requests),
privacy redaction, stale request IDs after cooldown, folder ownership/quota races,
composite foreign keys, multi-folder assignment and cascades, unpublished work
redaction, literal search, report visibility/deduplication/budgets, all target types,
conditional admin decisions and v1 envelopes. One case uses separate real creator
and moderator browser contexts through the full follow/friend/folder/report/result
chain; this caught a Router-dependent link rendered outside the admin router.
Eleven new browser cases cover relationships/search, folder create/edit/filter/delete,
assignment retry and focus restoration, report validation/results, anonymous entry,
zh/en/ja light mobile dialogs, empty later-page recovery and old-account response
isolation. Existing theme fixtures now explicitly include relationship reads.
Migration assertions include all five new tables/columns and queue/ownership indexes.
Screenshots are controlled test data; all clusters were destroyed. No production
SQL, relationship/report/collection creation or deployment occurred. Existing
notifications were unchanged; no private messages/email/push were added.
See SOCIAL_COLLECTIONS_2026-11-07.md for contracts, bounds and evidence.

2026-11-07 social production release: clean f55bb98 and fixed tag
release-2026-11-07-social are live. Preflight build/lint, eight release scenarios,
deploy-script and backup checks passed; earlier 362 unit / 240 disposable DB /
94 UI and incremental migration checks cover the unchanged feature source.
All 195 shipped files, 13 original uploads, config and nine business fingerprints
match, including after browser verification. Five new tables, seven key indexes
and two composite ownership foreign keys exist. Real verified HTTPS returned
22 passes with no warnings/failures; 16 pages returned 200, 14 anonymous private
reads returned 401, legacy 301 and public privacy/thumbnail checks passed.
Temporary creator/admin sessions exercised all connection reads, people search,
folder/report reads, v1/no-store, desktop/390px navigation and create/report forms
without submitting, admin report queues and anonymous connect entry. Zero page
errors/overflow; all five new tables remained empty and existing business data
unchanged. Sessions revoked with 401 verified, private credential files removed.
An initial probe awaited a sum of unresolved locator-count promises; the probe
was fixed and repeated with fresh short-lived sessions, without changing code or
redeploying. Release, backups and evidence: RELEASE_2026-11-07_SOCIAL.md.

2026-11-07 social entry correction: 362 unit, 241 disposable database and
102 browser checks pass. Public creator discovery has a field whitelist,
visibility, literal-search, published-only count, pagination and v1 check.
The separate-account database journey now begins at /creators. Eight added
browser checks cover global/menu/author entry points, actual social actions,
self/anonymous states, private author redaction, three-language mobile,
retry, paper theme and mobile navigation. Legacy payment/rating mocks now
provide the new author relationship read; order behavior is unchanged.
Visual screenshots were inspected; production read-only verification follows
the fixed release, and actual relationship writes stay in disposable data.

Social entry production verification: 17 routes, 14 anonymous authorization
denials, 22 HTTPS checks, real desktop/mobile creator-directory and author/menu
entries pass. All 196 source files match, 13 uploads and configuration hashes
are unchanged, and all 14 business-table fingerprints match both after deploy
and after UI verification. Temporary visitor/admin sessions were revoked and
checked as unauthorized; credential files removed. No business data was written.

2026-11-07 private messages and following feed: build/lint, 365 unit,
254 complete disposable-DB and 116 complete browser checks pass, with old-schema
upgrade/idempotence and both existing notification suites. Added 13 DB, 14 UI,
and 3 validation checks. A real two-context journey sends a request, accepts,
exchanges messages, checks read receipts, follows a publication and reads it.
Isolation, canonical pairs, quotas, sequence/cursor, idempotent retries,
blocking, visibility, feed read races, three-language mobile, response loss,
read-ack retry, offline draft retention and late old-account replies are covered.
All write journeys use disposable data; production verification must use only
read requests and canceled forms. See COMMUNICATION_2026-11-07.md.

Communication production verification: 19 public routes,
18 anonymous private-read denials and
22 HTTPS checks pass. Real desktop/mobile message/feed
entries, menu links, unread API, new-message form cancellation and anonymous
gates pass. 203 release files match; 13 uploads,
configuration hashes and all 17 pre-existing business-table fingerprints
are unchanged. All communication schema objects exist. No conversations,
messages or feed-read records were created by verification. Temporary sessions
revoked and credential files removed.

Communication slow-loading completion: 117 full browser checks and 365 unit
checks pass. A new clock-controlled ten-second response verifies that initial
loading is not restarted by periodic/focus refresh. This adds the fifteenth
communication UI check. Server/schema are unchanged from the fully validated
254-DB-check build; initial production evidence is preserved separately.

Slow-loading patch production: 19 routes, 18
anonymous private-read denials and 22 HTTPS checks pass.
Desktop/mobile thread lists now wait for actual loaded data/empty state before
screenshots and form checks. All 203 release files match, uploads and
configuration hashes remain unchanged, and 20
table fingerprints including communication data match before/after UI checks.
No business messages or read markers were written; temporary sessions revoked.
