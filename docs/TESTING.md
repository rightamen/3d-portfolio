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
| `test:api:db` | The same contract against a **disposable PostgreSQL**: register → verify → publish → order → download, 196 checks. | The browser. Every one of these calls the API directly, so a broken button, a wrong selector or an unrendered string all pass. |
| `test:schema-migration` | That `ensureSchema()` migrates an **existing** database, not just builds an empty one — the path production actually takes — and that it is idempotent. | Whether the new columns are ever read or written by anything. |
| `test:notifications` | The notification queries: who counts as unread, that marking read is per-person, that unpublishing empties every inbox, that one account cannot delete another's notice. | **The UI entirely.** A missing i18n key, a bell that never polls, a badge that never clears. This is the gap that shipped. |
| `test:notification-journey` | The whole chain in a real browser: a throwaway cluster, the real server, the real built frontend, **two accounts in two separate browser contexts**, a real price, a real click. | Anything not on that one path. It is one journey, not coverage. |
| `test:e2e` | Site routing, the admin console, admin visitor management, and a production smoke test, in a browser. | Server-side rules a browser never reaches. |
| `test:openapi` | That `docs/openapi/api-v1.yaml`'s error-code enum matches the server's actual codes. | Whether any route matches its documented shape. |
| `test:content-health` | The content-health checker, by handing it each failure on purpose. A checker nobody has fed a failure to is a checker that reports green either way. | Whether the site has any of those problems right now. |
| `test:admin-totp` | The hand-written TOTP against the standard, not against itself. A self-consistent implementation that generates and verifies its own wrong codes passes every self-test. | Everything else about admin auth. |
| `test:deploy-backup` | The deploy's hardlink-and-delete logic against a real filesystem, in a scratch directory. | Whether the real `/opt` is in the state it assumes. |
| `test:deploy-script` | `bash -n` over the remote half of the deploy. The remote half is the part with no undo: by the time bash reports a syntax error, the env file is backed up and the service is restarting. | Whether the commands are *right* — only that they parse. |
| `check:production` | The live site from outside over real TLS, **including the certificate**, which nothing else checks. It exists because the certificate expired on 2026-09-04 and every visitor got a browser warning. | Anything behind a login. |

## Rules that follow from the table

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
