# ADR: From one person's portfolio to a creator marketplace

Date: 2026-09-06

Status: Accepted, and largely built. Phases 1, 2, 3 and 5 shipped on
2026-09-07 along with phase 4's redirect; phase 6 and phase 7's core on
2026-09-08. What remains is a real payment provider (blocked on a business
entity, see §6) and phase 4's visual rebuild. See §7 for what each one
actually delivered and where the plan was departed from.

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

Shipped 2026-09-07. Two details worth keeping: internal links point at the
destination rather than through the redirect (`/api/projects` carries
`workUrl`), and the sitemap drops a project once its work is listed — telling
a crawler two things about one page, and asking it to follow a 301 to find
that out, is worse than saying it once.

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

**Addendum, 2026-09-10: the weight was never in the engine.** Rounds 26–28
fought three.js down to 467 KB on the critical path, and the catalogue that
replaced it then loaded **15.31 MB of images** — one 8.47 MB PNG serving as a
thumbnail, plus a 1.75 MB avatar for a 17px circle. Two orders of magnitude
more than the thing we spent three rounds removing, and invisible to every
check we had, because none of them looked at bytes on the browse page.

The owner reported it as "the homepage is too plain" and I nearly went looking
in the CSS. The tiles were not empty; the pictures had not arrived. Derivative
images (see ARCHITECTURE.md) took the same page to 108.5 KB.

The lesson generalises past images: **this project's performance rules were all
written about JavaScript**, because JavaScript was what hurt in 2026-07. A
"fast list" is not fast because it is a list. Before treating a density or
layout complaint as a design problem, measure what the page actually downloads.

**Addendum, 2026-09-10: a marketplace that did not tell anyone.**

For three rounds this document described orders, entitlement, evidence and
settlement, and every one of those descriptions was accurate. What none of them
noticed is that **nobody was told**. A stranger could order a work and the
creator would not learn it had happened -- there was no email, no notification,
nothing. They had to go and look at `/account/selling` on the off-chance.

Everything about the transaction was built and correct. The part that makes a
transaction *begin* was missing, and it was missing because "notify the seller"
is not a feature you can find by reading the schema. It only shows up if you
walk the journey as a person rather than as a request: place an order, then ask
what happens next. The stranger-journey walk in round 46 did exactly that and
still missed it, because the walk was done by one operator holding both
accounts, who therefore always already knew.

**Resolved 2026-09-10, and the method matters as much as the fix.** The walk is
now `npm run test:notification-journey`, and it drives **two accounts in two
separate browser contexts**. That is the whole correction: an operator holding
both sides of a transaction cannot experience "nobody told me", because they
were the one who did it. A seller learning something only counts as learning if
the buyer is somebody else. The same run then found a second silent failure the
query suite could not see — every notification rendered with a blank label,
because a dictionary key was built without capitalising its first letter.

The general form, and the reason it belongs in this file rather than only in a
progress entry: **this platform's failure mode is silence, not error.** It holds
no money, so it cannot bounce a payment. It cannot force a refund. Almost
nothing it gets wrong produces a stack trace — a lost sale, a wrong-shaped
banner, a 15MB thumbnail and an unnotified creator all look exactly like a quiet
site. Round 56 recorded the measurement version of this rule; this is the
behavioural one. Before adding to the marketplace, ask what a person would be
waiting for, and whether anything tells them.

## 6. Money

⚠️ **Revised 2026-09-08. Stripe Connect was the decision on 2026-09-06 and it
does not fit.** The owner asked for payment methods usable from China, and
three facts settle it:

1. **Stripe does not serve mainland China** as a merchant country.
2. **Domestic Alipay/WeChat merchant integration requires ICP filing**, which
   requires the server to be physically in mainland China. This one is in
   Japan (`bytevirt.JP`), so the direct route is closed without a move.
3. **The owner has no business entity**, and platform-collected settlement in
   China ("代收代付") needs a payment licence or a licensed intermediary.

Those are facts about the world, not about the code, and no amount of code
gets past any of them.

### What was built instead

A **provider-agnostic order and entitlement model**, with `direct` as the
first provider: the buyer pays the CREATOR — an Alipay or WeChat code, a
transfer — and the **creator** confirms receipt, because they are the only one
who can see it arrive. The platform never touches the money, which is what
keeps this buildable with no company and no payment licence.

`ordersStore.hasEntitlement` is the single answer to "may this person have the
file", and every download path asks it. Free is a price, so a free work needs
no order at all. Two rules live in the database rather than in a query: one
paid order per buyer per work, and a ticket that names neither a project nor a
work.

### Fairness, and what a platform that holds no money can actually do

The owner asked whether platform collection is needed to keep creators and
buyers honest. Two things were being conflated, and separating them is what
made this shippable:

- **Forcing a refund** requires holding the money. It requires an entity, a
  licensed split-settlement product, and KYC for every creator. There is no
  version of it without those.
- **Keeping evidence** requires none of that, and is the same evidence a
  platform-collecting provider would need later.

So the evidence was built now:

- `order_events` is append-only — a separate table rather than a jsonb array,
  because an array is rewritten whole on every append, and a record that can
  be rewritten whole is not a record. Nothing in `ordersStore` updates or
  deletes a row in it.
- `orders.payment_snapshot` holds the creator's payment methods **as the buyer
  was shown them**. Not a denormalisation for speed: a creator who changes
  their code after a dispute starts would otherwise erase what the buyer was
  told, and the order would agree with the creator's new story.
- `listStaleOrders` surfaces orders a buyer says they paid for and nobody
  confirmed. That list *is* the leverage: an operator cannot act on funds they
  never held, but they can act on the account.
- `platformFeeBasisPoints` forces the fee to zero for `direct`, as a named and
  tested rule rather than a line inside `createOrder` — the next provider is
  the one likely to break it.

⚠️ **What buyers must be told, in the purchase flow and not in the terms:**
an Alipay or WeChat transfer to an individual has no chargeback and no buyer
protection. Their recourse is that the platform can suspend a creator who does
not deliver — not that the platform will return their money, because it never
had it.

### The routes that remain open, for when there is an entity

| Route | Entity needed | Server | Notes |
| --- | --- | --- | --- |
| Stripe + Alipay/WeChat as payment methods | HK / SG / JP / US … | may stay in Japan | Chinese buyers pay the way they expect; Connect payouts to mainland accounts are restricted |
| Alipay Global / WeChat Pay cross-border | overseas company | may stay in Japan | the same idea without Stripe in the middle |
| Domestic Alipay/WeChat merchant | mainland licence + corporate account | **must move to mainland, ICP filing** | best rates and experience, heaviest compliance |

Each is an adapter that fills in `orders.provider` and calls `settleOrder`
from a webhook. Nothing above `ordersStore` knows what a card is.

⚠️ **Payment-provider country support changes.** The table above reflects
what was true when this was written; confirm against the provider's own
documentation before committing to one.

Things that are the owner's, not the code's, and which still gate a real
payment provider:

- A business entity, and which jurisdiction it is in.
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

| # | Phase | Depends on | Ships | State |
| --- | --- | --- | --- | --- |
| 1 | Creator + work data model, migration | — | Schema, stores, migration of the 4 works | **Shipped** 2026-09-07 |
| 2 | Publishing flow | 1 | Multi-file upload, draft→review→published | **Shipped** 2026-09-07 |
| 3 | Discovery | 2 | Browse, search, filter, creator pages | **Shipped** 2026-09-07 |
| 4 | New interface shell | 3 | The rebuilt frontend, 3D per §5's split | **Shipped** 2026-09-09, except the hero copy (see below) |
| 5 | Comments | 2 | Threaded, sorted, moderated | **Shipped** 2026-09-07 |
| 6 | Themes | 3 | Per-user theme, stored and rendered | **Shipped** 2026-09-08 |
| 7 | Payments | 2, 6 | Orders, entitlement, gated download | **Core shipped** 2026-09-08 (manual provider; see §6) |

Phase 7 is last on purpose: a marketplace with no content and no audience has
nothing to sell. Everything before it is useful on its own.

### Where the order was departed from, and why

**Phase 5 was built before phase 4**, because phase 4's redirect turned out to
depend on it. `/projects/:slug` carried a detail panel, likes, comments and a
download request; `/w/:handle/:slug` had a summary and a file list. A 301 is
permanent and browsers cache it for a long time, so redirecting the richer page
to the thinner one would have been a downgrade nobody could take back. The work
page got comments, likes and the missing specification fields first.

**The download flow was deliberately NOT rebuilt**, on evidence rather than
taste. On 2026-09-07 production held zero rows in `download_requests`, zero in
`download_tickets` and zero in `download_events`: that flow had never been used
by anyone. Rebuilding it before phase 7's entitlement model exists would mean
building it twice, so the redirect drops it. `project_likes` and
`project_comments` were **not** zero — two rows each — so both were migrated,
because a redirect that silently discards what people left behind is a deletion
with extra steps.

**Phase 4 turned out to be product work, not visual work.** The plan said
"the rebuilt frontend"; what the site actually needed was for the front door
to describe the product. Three things, all shipped 2026-09-09:

- The homepage catalogue read `/api/projects` -- the owner's four legacy
  works -- and would have gone on showing only theirs however many creators
  joined. It reads the marketplace now.
- Nothing anywhere told a visitor they could publish, which is the one thing
  §1 is about. `PublishCta` says so on the homepage and on `/explore`.
- The owner's About, Experience and Contact moved to their profile. A
  marketplace front page is somewhere people arrive, not somebody's page.

And one measured fix: six category descriptions rendered on the default
"All" filter, putting 1096px of explanation between the section heading and
the first work at 440px, on a 6046px page. On a portfolio that was a
statement about craft; on a catalogue it is six essays in front of the thing
people came for. Now 330px, with the text one chip away.

⚠️ **What is deliberately NOT done: the hero copy.** It still reads "Hi, I am
Right / Creating Next-Gen Props / 3D model and game art asset creator" --
a personal portfolio hero on a marketplace, so a visitor landing there is
told nothing about what the site is. That is the owner's name and tagline and
the change is theirs to make, so it was raised rather than taken.

**Themes are three knobs, not CSS.** The ADR said "per-user theme" without
saying what a theme is. It is an accent colour and two presets, applied to the
creator's own pages only. Free-form CSS was considered and rejected: a
stylesheet from a creator could restyle the marketplace chrome around their
page, cover a report button, or imitate a checkout dialog, and none of that is
worth what a free stylesheet buys. The accent must clear 3:1 against its
surface, so a creator cannot ship a page whose own links are invisible.

**The redirect is conditional, which is what makes it reversible.** It fires
only when a *published* work records that slug as its `source_slug`; everything
else keeps serving the old page. Nothing about the redirect is stored, so
hiding the work brings the old URL back — and that is a test, not a hope.

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
