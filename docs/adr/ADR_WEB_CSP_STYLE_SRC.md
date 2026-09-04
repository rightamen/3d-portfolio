# ADR: Web CSP `style-src` and `'unsafe-inline'`

Date: 2026-09-04

Status: Accepted. The header edit is a separate commit; §7 lists what has to be
true before it lands.

## 1. Background

`server/index.js` sends, on every response:

```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

`script-src` has been free of `'unsafe-inline'` since the policy went from
report-only to enforcing. `style-src` never was, and `PROJECT_PROGRESS.md`
carried the reason as roadmap item 9:

> CSP 还可以再紧一格：`style-src` 现在带 `'unsafe-inline'`（Tailwind 与 three.js
> 的内联样式），要去掉得先上 nonce 或 hash，不是小改动，暂不动。

Two claims are packed into that sentence: that the app emits inline styles which
the policy has to cover, and that covering them requires a nonce or a hash. The
first is stated as fact and the second follows from it. **Both are wrong**, and
this round measured why rather than argued it.

The reason it looked true is that the app is full of inline styles. There are 40
`style={{…}}` props across 15 files in `src/`; `src/components/admin/
AdminGalaxy.jsx` sets CSS custom properties (`--dot-size`, `--stagger-index`)
that way; `motion/react` rewrites `transform` and `opacity` on every animated
element on every frame; `@react-three/drei`'s `<Html>` assigns a whole
`style.cssText` string to its container. Open devtools on the homepage and the
DOM is visibly littered with `style="…"` attributes — 441 *distinct* attribute
values on `/` in a ten-second window (§4.5). It is an entirely reasonable thing
to look at and conclude that removing `'unsafe-inline'` would break the site.

It does not, because **CSP does not govern the CSSOM**, and every one of those
attributes is written through the CSSOM.

## 2. What CSP actually governs

`style-src 'unsafe-inline'` covers two things, which CSP3 splits into
`style-src-elem` (a `<style>` element's contents) and `style-src-attr` (a
`style` HTML attribute). Neither directive is set here, so both fall back to
`style-src`.

Neither of them applies to `element.style.foo = …`. A property write, a
`setProperty()`, or an assignment to `cssText` goes through the CSSOM interface,
which the CSP algorithms never enter. The element ends up carrying a `style`
attribute that a CSP-checked parse would have rejected — the browser simply
never checks it, because it was not parsed.

React DOM writes inline styles exactly this way (`node.style[name] = value`, and
`node.style.setProperty()` for `--custom` properties). So does `motion/react`.
So does drei's `<Html>`. So the app's 441 attribute values are invisible to the
policy. Measured, per mechanism, in §4.4.

This also settles the hash question, which is moot but worth writing down since
roadmap item 9 raised it. Chromium says it itself, verbatim, in the console when
a style attribute is blocked:

> Note that hashes do not apply to event handlers, style attributes and
> `javascript:` navigations unless the `'unsafe-hashes'` keyword is present.

A hash allowlist does not cover style *attributes* at all without
`'unsafe-hashes'`, and with it you need one hash per distinct attribute *value*.
This app produced 441 distinct values on one route in ten seconds, most of them
frame-by-frame `transform` strings computed at runtime. Had the attributes been
CSP-visible, hashing would not have been "not a small change" — it would have
been impossible. That path was never available; it just also was never needed.

## 3. Options

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Leave `'unsafe-inline'` in place | Zero work, zero risk | Keeps the one keyword in the policy that an injected `<style>` can use — for defacement, for CSS-based exfiltration of attribute values, for overlaying the login form. `script-src` gave it up; `style-src` had no reason left to keep it | Rejected |
| Nonce per response (`'nonce-…'` + `MotionConfig nonce`) | The textbook answer; would also unblock `AnimatePresence mode="popLayout"` (§5) | Makes the CSP header vary per response, which `tests/api/contract.spec.js` asserts it does not; the header would have to be generated in the SEO path and the built `index.html` rewritten per request; and it buys nothing, because nothing today emits a `<style>` element | Rejected |
| Hash allowlist (`'sha256-…'`, plus `'unsafe-hashes'` for attributes) | None that apply | 441 distinct attribute values on one route, most computed per frame; `'unsafe-hashes'` is itself close to `'unsafe-inline'` in effect | Rejected — and not merely costly, but unimplementable |
| Drop `'unsafe-inline'`, keep the rest: `style-src 'self' https://fonts.googleapis.com` | One keyword deleted. Measured at zero violations across every route and interaction reachable without credentials, in both the local production build and the deployed site | Two surfaces could not be exercised this round (§7); a future `popLayout` or a hand-written `<style>` would break silently rather than loudly | **Accepted** |
| Also drop `https://fonts.googleapis.com` | Shorter policy | Measured: breaks the `@import` at `src/index.css:1` on every route (§4.3). It is the control that proved the probe works, not a candidate | Rejected |

## 4. The measurements

The build under test is `npm run build` at `9af842d`, served by the real server
(`PORT=4321 NODE_ENV=test node server/index.js`). Playwright rewrites the
document response's `Content-Security-Policy` header on the way into Chromium
149, so the policy under test changes without `server/index.js` changing.

**The listener.** A previous round in this project wrote this same probe and
read a false "no violations": its `securitypolicyviolation` listener was an
inline `<script>`, so the policy under test blocked the listener itself. Here it
is installed with `context.addInitScript(…)`, which the browser injects rather
than parsing out of the document, so it is not subject to the policy. Two
further traps cost time and are recorded so the next probe avoids them:

- `securitypolicyviolation` is dispatched **asynchronously**. Triggering a
  violation and reading the array in the same synchronous `page.evaluate` block
  returns empty — which is exactly the false negative this ADR exists to avoid.
  Every trigger below is followed by a 350–500 ms wait before the read.
- The event targets the offending element and bubbles. `setAttribute('style',…)`
  on a **detached** element fires at an element that is not in the document, so
  a `document`-level listener never sees it. The self-test appends first, then
  sets.

### 4.1 Proof that the probe detects violations

Every route in every run ends with three deliberate violations of the policy
under test, and the listener has to report all three:

| Trigger | Expected | Detected under `style-src 'self' 'report-sample' https://fonts.googleapis.com` | Detected under the live policy (control) |
| --- | --- | --- | --- |
| `<style>` element with text | `style-src-elem` | 1 on every route | 0 — allowed, as it should be |
| `setAttribute('style', 'color: rebeccapurple')` on a connected element | `style-src-attr` | 1 on every route; computed colour stayed `rgb(255,255,255)` | 0 — allowed; computed colour became `rgb(102,51,153)` |
| inline `<script>` element | `script-src-elem` | 1 on every route | 1 on every route (`script-src` is unchanged) |

The control column matters as much as the test column: under the current policy
the two style triggers are *not* reported, which proves the harness is reading
the policy it was given and not a cached or default one.

### 4.2 Page violations under the proposed policy

`style-src 'self' 'report-sample' https://fonts.googleapis.com`. Each route
loaded, allowed 3–6 s to settle, scrolled top to bottom in 500 px steps, and
hovered over its first twelve links and buttons.

| Route | `style-src-elem` | `style-src-attr` | any directive |
| --- | --- | --- | --- |
| `/` (3D hero) | 0 | 0 | 0 |
| `/projects/fire-extinguisher-next-gen` | 0 | 0 | 0 |
| `/community` | 0 | 0 | 0 |
| `/admin` (signed out) | 0 | 0 | 0 |
| `/login?mode=login` | 0 | 0 | 0 |
| `/account` | 0 | 0 | 0 |

A second, deeper pass drove the code paths a plain load does not reach. DOM
counts are taken at each checkpoint; `[style]` is the number of elements
carrying an inline style attribute at that instant, `<style>` the number of
style elements in the document.

| Checkpoint | violations | canvases | `[style]` | `<style>` |
| --- | --- | --- | --- | --- |
| `/` after load, hero settled | 0 | 1 | 123 | 0 |
| `/` after full scroll (all motion sections entered) | 0 | 1 | 73 | 0 |
| `/` model preview open — drei `<Html>`, `cssText` path | 0 | 2 | 117 | 0 |
| `/` model preview after an orbit drag | 0 | 2 | 77 | 0 |
| `/projects/:slug` detail overlay, client-side nav | 0 | 1 | 115 | 0 |
| `/community` after clicking through the tabs | 0 | 0 | 0 | 0 |
| `/admin` signed out | 0 | 0 | 1 | 0 |

Between 73 and 123 elements are wearing an inline style attribute at any moment
on the homepage, and not one of them is checked. `<style>` is **0** everywhere:
the production build ships one static stylesheet
(`dist/assets/index-WMg2nGvk.css`, 254.78 kB, loaded by `<link rel=stylesheet>`)
and injects no style element at runtime. Tailwind v4 through
`@tailwindcss/vite` is a build-time transform; the dev server's injected style
block does not exist in `dist/`.

The same probe was run against the deployed site with the same header rewrite,
so `/community` and a real post (`/community/1781534266556-atb11d`) were
measured against real database rows rather than the DB-less local fallback: 0
violations on all six URLs, `<style>` 0 on all six.

### 4.3 Control: a violation the app really does produce

Run the identical probe with `style-src 'self'` — dropping the font origin as
well — and every route reports exactly one violation:

```
style-src-elem <- https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300;800&display=swap
```

That is `src/index.css:1`, hoisted into the built stylesheet as an `@import`. It
is a real, app-generated, load-time violation on 6/6 routes, found by the same
listener that reports zero for the proposed policy. A probe that can find this
one is a probe whose zeros mean something.

### 4.4 Which mechanisms CSP actually blocks

Run against `/community` under
`style-src 'self' 'nonce-abc123nonce' https://fonts.googleapis.com`:

| Mechanism | Where it appears in this app | Blocked | Effect |
| --- | --- | --- | --- |
| `el.style.color = …` | every React `style={{…}}` prop | **no** | applied; element gains a `style` attribute the policy never inspects |
| `el.style.setProperty('--dot-size', …)` | `AdminGalaxy.jsx` custom properties | **no** | applied |
| `el.style.cssText = …` | drei `<Html>` container | **no** | applied; `style` attribute present |
| `el.setAttribute('style', …)` | **nowhere** — 0 hits across all 26 built JS chunks | yes, `style-src-attr` | value dropped |
| parsed markup with `style=""` (`innerHTML`) | nowhere; no `dangerouslySetInnerHTML` in `src/` or `server/` | yes, `style-src-attr` | value dropped |
| `<style>` element with text | nowhere | yes, `style-src-elem` | `sheet` is `null` |
| empty `<style>` + `sheet.insertRule()` | `motion` `usePopLayout`, present but unreached (§5) | yes, `style-src-elem` | `sheet` is `null`, so `insertRule` silently never runs |
| the same, with `.nonce` set | — | no | `insertRule` runs |
| `new CSSStyleSheet()` + `adoptedStyleSheets` | nowhere | **no** | applied |

The left column is the whole answer. Everything this app does is in a row marked
"no"; every row marked "yes" is a thing it does not do.

### 4.5 How many hashes the rejected option would have needed

Sampling `document.querySelectorAll('[style]')` at 10 Hz through load and a full
scroll, counting distinct attribute strings:

| Route | distinct `style` values in ~10 s |
| --- | --- |
| `/` | 412, 441 (two runs) |
| `/projects/fire-extinguisher-next-gen` | 430 |

Unbounded and runtime-computed — `opacity: 0; transform: translateY(10px);`,
`background-image: url("/assets/mountain-3.png"); … will-change: transform;
transform: none;`, and one per animation frame besides. This is the number that
makes the hash option not merely expensive but impossible, and it is recorded
here only so nobody re-proposes it.

## 5. The one real hazard: `motion`'s `popLayout`

`dist/assets/Hero-*.js` contains this, from `motion/react`'s `usePopLayout`:

```js
const v = document.createElement("style");
d && (v.nonce = d);
… N.appendChild(v), v.sheet && v.sheet.insertRule(`[data-motion-pop-id="…"] { position: absolute !important; … }`)
```

That is a `<style>` element, and §4.4 measures it as blocked without a nonce —
with `v.sheet` coming back `null`, so the guard swallows it and `insertRule`
never runs. No error, no exception; the popped element just fails to be taken
out of flow and the layout jumps.

It does not fire today. `src/` has exactly one `AnimatePresence`, in
`src/components/FlipWords.jsx`, and it uses the default mode. `usePopLayout` is
reachable only via `mode="popLayout"`, which appears nowhere. The measurements
in §4.2 are consistent with that: `<style>` count 0 on every route including
the ones that mount `FlipWords`.

The other `createElement("style")` in the bundle is React 19's own `<style
precedence>` hoisting in `react-vendor-*.js`, which runs only when the app
renders a `<style>` React element. `grep -rn "<style" src/ server/ index.html`
returns nothing, so it does not.

Both are dormant, not absent. The escape hatch for the first one is
`<MotionConfig nonce>`, which is the only scenario in which the nonce option
from §3 comes back on the table.

## 6. Decision

Remove `'unsafe-inline'` from `style-src`, leaving:

```
style-src 'self' https://fonts.googleapis.com
```

No nonce. No hash. No `'unsafe-hashes'`. Roadmap item 9's premise — that
removing the keyword requires one of those — is superseded: the app emits no
CSP-governed inline style at all, so there is nothing for a nonce or a hash to
cover. The keyword has been carrying no load.

`https://fonts.googleapis.com` stays, for `src/index.css:1`, and is the one part
of the directive that is load-bearing.

This ADR does not itself change the header. The one-line edit to
`server/index.js` ships as its own reviewed commit, once §7 is satisfied.

## 7. Before the edit lands

Two surfaces could not be exercised this round, and both should be walked once
with the tightened header before it is deployed:

- **The signed-in admin dashboard.** `AdminGalaxy` — the second 3D canvas, the
  `--dot-size` custom properties, the motion-heavy charts — lives inside
  `AdminDashboard`, which needs credentials this round did not have. Its `<Html>`
  usage is the same drei code path that §4.2 exercised through `ModelPreview` on
  `/`, and `dist/assets/Admin-*.js` contains no `createElement("style")` and no
  `setAttribute("style")`, so the static evidence is good — but it is static
  evidence, not a browser pass.
- **A populated community feed.** The local server ran without `DATABASE_URL`,
  and the deployed `/community` rendered thin during the run. The post detail
  page was measured; the populated list was not.

Two further caveats worth stating rather than burying:

- **One engine.** Chromium 149 only; Firefox and WebKit are not installed and
  no dependency was added to get them. The CSSOM exemption is a property of the
  CSP algorithms, not of Chromium — no engine has ever checked a property write
  — and Safari, which implements neither `style-src-elem` nor `style-src-attr`,
  falls back to `style-src` with the same outcome. Still unmeasured.
- **`/api/csp-report` is the safety net.** It already exists and is already in
  the policy, and after this change it is the only thing that would surface a
  style violation on a code path no browser pass covered. A violation is a
  broken page now, not a report-only note.

The existing assertion in `tests/api/contract.spec.js` — one identical policy
for every response, no `sha256-`, no `nonce-` — survives this decision unchanged
and is the reason the nonce option was rejected rather than merely deferred.
When the edit lands it should gain a `style-src` clause alongside the
`script-src` ones already there.

## 8. What would change this decision

- Anyone reaching for `AnimatePresence mode="popLayout"`, a `<style>` React
  element, or a library that injects one at runtime (§5). The fix then is
  `<MotionConfig nonce>` plus a per-response nonce, which also means giving up
  the identical-header invariant.
- A third-party embed — an analytics or chat widget — dropped into `index.html`.
  Every one of them writes a `<style>` block. That is a policy negotiation, not
  an oversight, and it belongs in its own ADR.
- CSP ever extending to the CSSOM. There is no such proposal; if there were, it
  would break far more than this site, and §4.5 says what the bill would be.
