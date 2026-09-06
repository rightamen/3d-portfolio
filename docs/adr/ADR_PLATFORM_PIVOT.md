# ADR: From one person's portfolio to a creator marketplace

Date: 2026-09-06

Status: Accepted. Phase 1 only is in progress; every later phase is listed here
so the shape is agreed before it is built, not after.

## 1. What is changing

mrright.blog is a personal 3D portfolio: four works belonging to the site
owner, plus a community area where signed-in visitors can post and upload
resources for moderation. The owner has decided it becomes a platform:

- **Anyone can publish.** A work belongs to the creator who uploaded it. The
  owner stops being special and becomes the first creator.
- **Creators can sell.** Real money, in-platform, with payouts.
- **The interface uses 3D where 3D earns its place**, not everywhere.
- **Every signed-in user themes their own space.**
- **Every work has a discussion**, in the shape people expect from YouTube.

Three decisions were taken by the owner on 2026-09-06, recorded here because
each one rules out a cheaper alternative and the reasoning should survive:

| Question | Options offered | Chosen |
| --- | --- | --- |
| How far does "selling" go? | External payout links / **Stripe Connect** / price field only | **Stripe Connect** |
| How much of the UI is 3D? | **Hybrid** / everything / toggleable immersive mode | **Hybrid** (revised same day, see §5) |
| The four existing works? | **Migrate to a normal creator** / keep a curated slot / wipe | **Migrate** |

## 2. What already exists, and what that saves

This is not a greenfield build, and the audit below is why the estimate is
months rather than years. The current system already has, working and tested:

- **Accounts** with email verification, password reset, TOTP for admins,
  session handling, and per-account rate limiting.
- **Uploads** with magic-byte signature validation (`fileSignatures.js`), per
  extension allowlists, size caps, and per-account quotas. `community_uploads`
  is a creator-work table in all but name: owner, title, description, category,
  file, preview, moderation status.
- **Threaded comments with likes** — `community_comments` already carries
  `parent_id` and `community_comment_likes`. That is half of the YouTube shape
  before anything is written.
- **Download authorisation** — `download_requests`, `download_tickets`,
  `download_events`. A purchase is a new reason to issue a ticket, not a new
  mechanism.
- **Moderation tooling** — a trilingual admin console with content health
  checks, member management and an audit trail.
- **Per-route server-rendered `<head>`** with JSON-LD (`server/seo.js`). This
  matters enormously for the 3D decision; see §5.

The data to migrate is tiny: 3 custom projects, 2 project overrides, 0
community uploads, 1 community post, 1 non-owner account. Migration risk is
close to zero, and that is a fact worth acting on now rather than after the
tables have grown.

## 3. Data model

The new centre of gravity is `works`. It replaces the three-way split between
`content.js` static projects, `project_overrides`, `custom_projects` and the
work-like half of `community_uploads`.

```
creators            extends visitor_users -- handle, bio, avatar, banner,
                    theme (jsonb), stripe_account_id, payout_state

works               id, creator_id, slug, title, description, category, tags,
                    status (draft|review|published|hidden),
                    price_cents, currency, license, stats

work_assets         work_id, kind (preview|model|source|texture|image),
                    file_url, bytes, checksum, sort_order
                    -- a work is many files, which community_uploads never was

work_comments       work_id, author_id, parent_id, body, like_count, pinned
                    -- shaped on community_comments, which already threads

orders              buyer_id, work_id, amount_cents, currency, status,
                    stripe_payment_intent_id, purchased_at
                    -- grants the right to a download ticket

payouts             creator_id, amount_cents, period, stripe_transfer_id
```

Two deliberate choices:

- **`work_assets` is a separate table from the start.** `community_uploads`
  models one file per row, and every marketplace work is a bundle — a preview
  image, a viewable GLB, a source archive, texture sets. Retrofitting that
  later would mean migrating rows that by then have money attached to them.
- **`price_cents` as an integer, with an explicit currency.** Floating point
  money is a class of bug this project does not need to rediscover.

## 4. URLs, and the SEO that already exists

Works move to `/w/:handle/:slug`, which puts the creator in the URL — the
thing that makes a marketplace legible.

⚠️ **The four existing project URLs are indexed.** Rounds 23–24 gave them
per-route titles, canonical URLs, JSON-LD and share cards, and round 28 gave
them `modulepreload` hints. `/projects/:slug` must therefore **301 to the new
URL**, permanently, and `server/seo.js`'s `resolveRoute` has to keep answering
for the old shape. Dropping those URLs would throw away the only SEO this site
has, to save a redirect.

## 5. Where 3D goes, and where it deliberately does not

The owner first asked for a fully 3D interface, was shown the conflict below,
chose "everything" anyway, and then within the hour revised it to hybrid. Both
the conflict and the revision are recorded, because the reasoning is what stops
this being relitigated in three months.

**The conflict.** Rounds 26–28 were spent getting three.js *off* the critical
path. Before that work a shared project link pulled 1489 KB before the panel
appeared and measured 21–35 s on a real connection; after it, 467 KB and no
three.js on the critical path at all. Round 30 then made the admin 3D map
reachable by keyboard. A naive "everything is 3D" hands all of that back, and
costs mobile and search traffic to buy an effect.

**The split.** 3D is used where the subject *is* three-dimensional, or where
spatial browsing genuinely beats a grid:

| 3D | Flat DOM |
| --- | --- |
| Work detail — the model viewer (`ModelPreview` already does this) | Browse, search and filter results |
| Gallery / spatial browsing as a mode | Comments |
| Creator profile hero | Upload and publish forms |
| Landing page hero (already 3D today) | Checkout, settings, account |
| | The admin console |

The test for a new surface is: *would this be worse as a fast list?* If the
answer is no, it is a list.

**The contract, which survives the revision.** Even in the hybrid, the
following are requirements rather than aspirations — they are also what makes
the "everything" option cheap to revisit later, if the owner changes their mind
again:

1. **The server keeps rendering the head.** `server/seo.js` already injects
   title, description, canonical, Open Graph and JSON-LD per route, plus a
   `<noscript>` body. Crawlers and link-preview scrapers keep getting a
   complete answer without executing a line of WebGL. Built already; must not
   regress.
2. **Content lives in the DOM; 3D is a layer over it**, never a canvas that
   paints text. Screen readers, keyboard users and `prefers-reduced-motion`
   get real elements — round 30's focus-layer technique, generalised.
3. **A device without WebGL still gets a usable site.** The `webglSupported`
   probe and flat fallback in `AdminGalaxy` are the pattern.
4. **three.js stays out of the first paint of any page whose purpose is not
   3D.** Checkout, forms, comments and settings never wait on an engine.

`scripts/measure-project-link.mjs --chain` exists to measure exactly this and
should be run against the new frontend, not assumed.

## 6. Money

Stripe Connect, Express accounts: Stripe hosts creator onboarding and KYC, the
platform takes an application fee, Stripe handles payouts.

Things that are the owner's, not the code's, and which gate launch:

- A Stripe account, and Connect enabled on it.
- Whether a business entity is needed, which depends on jurisdiction.
- **Tax on cross-border digital goods** (VAT/GST). Stripe Tax can compute it;
  someone still has to decide registration and liability.
- Refund, licensing and takedown policy — a marketplace needs stated terms
  before it takes the first payment, not after the first dispute.

⚠️ **No secret keys in the repo, ever.** They go in
`/etc/mrright-portfolio.env` alongside the existing ones, the same way
`ADMIN_TOKEN` and `DATABASE_URL` already do.

⚠️ **Purchases reuse the existing download-ticket machinery.** An order is a
new reason to issue a ticket; `download_tickets` and `download_events` already
exist and already expire. Building a second download path would mean two places
to get authorisation wrong.

## 7. Phases

Each phase is independently deployable and leaves the site working. That is the
constraint that makes a pivot this size survivable on a live site.

| # | Phase | Depends on | Ships |
| --- | --- | --- | --- |
| 1 | Creator + work data model, migration | — | Schema, stores, migration of the 4 works |
| 2 | Publishing flow | 1 | Multi-file upload, draft→review→published |
| 3 | Discovery | 2 | Browse, search, filter, creator pages |
| 4 | New interface shell | 3 | The rebuilt frontend, 3D per §5's split |
| 5 | Comments | 2 | Threaded, sorted, moderated |
| 6 | Themes | 3 | Per-user theme, stored and rendered |
| 7 | Payments | 2, 6 | Connect onboarding, checkout, entitlement, payouts |

Phase 7 is last on purpose: a marketplace with no content and no audience has
nothing to sell. Everything before it is useful on its own.

## 8. What would change this decision

If Stripe Connect turns out to be unavailable in the owner's jurisdiction, or
the tax obligation is heavier than the expected revenue, phase 7 degrades to
the external-payout-link option that was offered and declined — the data model
in §3 already supports it, since `works.price_cents` and an external URL are
the same shape to everything except the checkout.

If the hybrid turns out to feel too flat, the escape hatch is the
toggleable-immersive-mode option: a "3D gallery" entry point over the same
data, with the fast interface staying the default. §5's four requirements are
what keep that door open — they are why adding more 3D later stays a rendering
change rather than an SEO and accessibility rebuild.
