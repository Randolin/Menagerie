# The feature plan — what to build next, and why

A **plan**, not a commitment. Nothing here is frozen; items get cut or
reshaped as they meet the code. What is fixed is the diagnosis below, which
is the argument for the ordering.

## The diagnosis

Menagerie is unusually well built for the **first** person to arrive. You can
hatch in a second, the survey is careful, the creature is charming, the
threat model is honest, and losing work is hard. Almost every recent commit
has made that first session better.

But the product's value only exists for the **second** person — the compare
is the payoff, and a compare needs two finished profiles and a moment where
both people look at it. Almost nothing in the app serves the space _between_
two people:

- You share a phrase and then have no idea whether they filled it out, or
  whether they changed an answer after you last looked. The out-of-band
  channel the app exists to avoid ("hey did you do the thing yet") becomes
  the coordination layer.
- A newcomer is asked to spend twenty minutes on a survey before they have
  ever seen what a comparison looks like. The payoff is invisible until
  after it has been paid for.
- The one artifact holding the whole relationship — the edit phrase — has no
  physical form, and typing a six-word phrase on a phone with no assistance
  is a typo minefield guarded by a multi-second Argon2 wait.

And the app's audience — people negotiating relationship shape and intimacy,
heavily overlapping queer, neurodivergent and disabled communities — is not
well served by a screen-reader experience with one `aria-live` region, zero
programmatic focus management, and charts with no non-visual equivalent.

So: **the space between two people**, then **the front door**, then
**everyone who can't use it today**. Reach and offline come last because
they multiply a loop that should work first.

---

## Track A — The second player

The highest-value work in the tree. Each item shortens the path from "I
shared my phrase" to "we looked at this together."

### A1 · Freshness in the menagerie

**What.** Each creature you keep shows whether it has changed since you last
looked at it: _new answers since you compared_, or _profile is gone_.

**Why it's cheap.** `GET /v2/profiles/view/:locator` already returns
`{ blob_view, version }`, and `version` increments on every save. The check
is one existing request per connection with no decrypt, no new endpoint, and
no server change.

**Where.**

- `libs/core/src/hatch/priv-data.ts` — add optional `lastSeenVersion?: number`
  and `lastCheckedAt?: number` to `SavedConnection`. Optional is the whole
  trick: `migratePrivData` already fills absent fields, so no `v` bump and no
  new migration.
- `libs/core/src/hatch/hatch-client.ts` — a `fetchViewVersion(client, phrase)`
  beside `fetchViewPayload`, deriving the locator and returning the version
  without decrypting.
- `src/app/stores/profile-session.store.ts` — record `lastSeenVersion` when a
  connection is viewed or compared; a `refreshConnections()` that fills in
  current versions.
- `src/app/menagerie/menagerie.component.ts` — badge, and an explicit
  "Check for updates" control.

**Design decisions to make deliberately.**

- **Refresh on page load plus an explicit button. No background polling.**
  A poll bumps `last_viewed_at`, which is good (it holds off GC) but also
  hands the server a heartbeat that says "this person is still watching this
  profile" on a schedule. One refresh per visit is indistinguishable from
  visiting, which is the point.
- Deriving the view locator costs Argon2id per connection. Cache the
  locator, not just the version, or a menagerie of ten becomes a ten-second
  wait. Locators are already secret-equivalent and already live in an
  edit-key-encrypted blob, so caching one costs nothing new.
- A 404 means deleted, expired, or re-minted, and the UI must not guess
  which. "This creature's phrase no longer opens anything" plus a remove
  action.

**Done when** a saved connection that saves an answer elsewhere shows as
updated on the next menagerie visit, with a spec covering fresh / updated /
gone, and the About page's honest-limits list mentions the refresh.

**Size.** Medium. The most valuable single item in this document.

### A2 · A demo compare, before you hatch

**What.** Two fictional creatures with full answer sets, comparable from the
landing page in one tap, showing the real panels with real scores —
including a dealbreaker alert and a mutual-desire reveal, because those are
the two things nobody expects and everybody remembers.

**Why.** It is the only way to show the payoff before charging for it, and
it fixes the cold start for every audience at once: the curious couple who
won't commit, the polyam power user evaluating whether this beats their
spreadsheet, the person who wants to see what their partner would see.

**Where.** A `src/app/demo/` route rendering `CompareComponent`'s panels
against bundled payloads rather than fetched ones — the compare pipeline
already separates "load and decrypt" from "score and render"
(`compare-model.ts` takes payloads), so the seam exists. Landing page gets
the entry point.

**Constraints.**

- Demo payloads must be built from real schema ids, and a spec must assert
  they still decode after any schema change. A demo that rots is worse than
  none.
- It must work with the server unreachable or unconfigured — nothing about
  it should touch `HatchClient`. This doubles as the one page that still
  works when the profile server is down.
- Reuse the QA cast in `docs/qa-profiles.md` rather than inventing a third
  set of fixtures, if their answers make a good story.

**Done when** a visitor with no profile and no server can see a full
comparison from the landing page, and the demo is one obvious step from
hatching.

**Size.** Medium.

### A3 · Close the loop when a stranger views you

**What.** Someone opens `#/view/<phrase>` from a QR with no profile of their
own. Today they read and leave. They should be offered: hatch your own, then
compare against the one you're looking at — with the viewed phrase already
in the compare slot and offered for their menagerie.

**Why.** This is the viral loop, and it currently ends in a dead end at the
exact moment of maximum interest.

**Where.** `src/app/view/view.component.ts` (a CTA when
`session.active()` is false), and `src/app/stores/compare.store.ts` to carry
the pending phrase across the hatch.

**Done when** a first-time viewer can go from a scanned QR to a two-way
comparison without ever typing a phrase by hand.

**Size.** Small.

### A4 · "Enough to compare" as a real moment

**What.** The survey has 23 `tier: 'core'` items among 96. Finishing the core
tier should be an explicit, celebrated milestone that hands you your share
controls, not a quiet threshold you cross without noticing.

**Why.** It converts survey fatigue into a checkpoint, and it puts the share
prompt at the moment the profile first becomes worth sharing.

**Where.** `src/app/dashboard/`, and whatever computes section progress.

**Done when** completing the core tier produces a distinct state with the
view phrase, QR, and "send this to someone" in it.

**Size.** Small.

---

## Track B — Make the front door survivable

### B1 · The backup card

**What.** A printable card: the creature portrait, both phrases, the view QR,
the date, and one line saying exactly what each phrase does and what losing
the edit phrase costs. Print to paper for a drawer, or to PDF for a password
manager.

**Why.** Permanent, unrecoverable loss is the product's worst failure mode
and its only mitigation today is "write it down." This is an afternoon of
work against it.

**Where.** A route under `/settings` plus a print stylesheet in
`libs/ui/src/styles/`. `window.print()` and `@media print` — no new
dependency, no canvas rasterizing, and the browser's own "save as PDF" does
the export.

**Constraints.** The card carries the edit phrase, so it needs an unmissable
warning that printing it puts full edit control on a piece of paper, and it
must never be reachable from a view-only session.

**Done when** a logged-in profile can produce a one-page card that reads
correctly in both themes and in print, with an e2e or component spec
asserting both phrases and the QR are on it.

**Size.** Small–medium.

### B2 · Phrase entry that forgives

**What.** Three things, in ascending order of payoff:

1. **Did-you-mean before Argon2.** A phrase whose words aren't in the
   wordlists cannot possibly be right, and checking that is instant while
   the KDF takes seconds. Reject early, name the word that's wrong, and
   offer the edit-distance-1 candidate. Today a typo costs a multi-second
   wait and a generic failure.
2. **Per-word autocomplete** on the phrase inputs. Wordlists are public by
   design (`persona/wordlists.ts`, `tail-wordlists.ts`, EFF), so suggesting
   from them leaks nothing that isn't already shipped in the bundle.
3. **Tolerant normalization** — spaces or hyphens, any case, stray
   punctuation, pasted URLs. `canonicalViewPhrase` and `extractViewPhrase`
   already do part of this; make sure both inputs use them consistently.

**Where.** `src/app/landing/landing.component.ts`,
`src/app/edit-login/edit-login.component.ts`, and a shared phrase-input
component in `libs/ui` once there's a second copy — per CLAUDE.md, extract
on the third.

**Constraint.** The EFF list is a lazy chunk and should stay one: load it on
first focus of an edit-phrase field, not on landing-page paint.

**Done when** a one-letter typo in either phrase produces an instant,
specific, correctable error instead of a slow generic one.

**Size.** Medium.

### B3 · Confirm the edit phrase at hatch

**What.** One lightweight confirmation step after hatching — retype a
single word from the edit phrase, or tick "I've saved this" next to the
backup-card link.

**Why.** It converts "I'll write it down later" into a decision made while
the phrase is still on screen. Pair it with B1 so the confirmation has
somewhere to send people.

**Constraint.** It must be skippable. The instant, frictionless hatch is a
real feature and a modal gate would spoil it.

**Size.** Small.

---

## Track C — Accessibility

Track A and B make the product better. This track makes it usable at all for
people it currently locks out, and C2 is good enough to be a headline
feature rather than a compliance chore.

### C1 · Routing, focus, and announcements

**What.** A skip link; focus moved to the view heading on navigation; a
polite live region announcing the new page; focus-visible styling audited
across the custom controls.

**Why.** The app is a hash-routed SPA with **zero** `focus()` calls and one
`aria-live` region. For a screen-reader user every navigation is silent and
leaves focus stranded on the link they just activated — this is the
difference between "hard" and "impossible."

**Where.** `src/app/app.ts` / `app.html` (the `<main id="view">` already
exists as a target), plus a small router subscription.

**Size.** Small. Highest ratio of impact to effort in this document.

### C2 · The plain-language compare narrative

**What.** A new compare panel that says, in sentences: what you two agree on
most, where you differ most, which dealbreakers need a conversation, and
what the directional fit scores actually mean.

**Why.** Three wins in one component. It is the non-visual equivalent of the
radar, strips, and matrix. It is a cognitive-accessibility win for everyone
under stress — and people read compatibility results under stress. And it is
the thing people will screenshot and quote to each other, which no chart
currently is.

**Where.** `src/app/compare/panels/narrative.panel.ts`, registered in
`app.config.ts` with `provideComparePanel({ id: 'narrative', order: 12 })` —
right after the headline. The panel receives a fully computed `CompareModel`
(`pair`, `interlocks`, `grid`, `desireRows`), so this is presentation over
data that already exists, not new scoring.

**Constraint.** Phrasing carries real weight here: it must describe
differences without moralizing about them, and never imply a verdict on a
relationship. Every sentence template deserves the same care the survey copy
got.

**Size.** Medium. The most interesting design problem in the plan.

### C3 · Chart alternatives and SVG semantics

**What.** Under each chart panel, a collapsible "Read this as a table."
Proper roles and labels on the SVG components in `libs/ui`, and
`aria-hidden` on the purely decorative ones.

**Where.** `libs/ui/src/` chart components; the compare panels get the
disclosure.

**Size.** Medium, mostly repetitive.

### C4 · Contrast and forced colors

**What.** Support `prefers-contrast: more` and `forced-colors: active` at the
token layer, and audit real contrast ratios in both themes — particularly
the `fine` class, the persona-derived accent colors, and the chart series
hues, which are generated rather than hand-picked and therefore unaudited.

**Where.** `libs/ui/src/styles/` tokens. The existing
`prefers-reduced-motion` blocks in `_base.scss` are the model to follow.

**Size.** Medium.

### C5 · Keyboard and screen-reader audit of the survey controls

**What.** Walk the importance controls, answer chips, scale inputs, and the
interest matrix with a keyboard and a screen reader. These are custom
controls carrying the product's core interaction; they need real roles,
states, and arrow-key behavior, not just `aria-label`.

**Size.** Medium, and it will produce its own list.

---

## Track D — Reach and resilience

### D1 · Make it a PWA

**What.** A manifest and a service worker: installable, and the survey
fillable offline with the draft syncing on reconnect.

**Why.** A static hash-routed site with client-side crypto and a local draft
store is nearly the ideal PWA already. Someone filling out ninety-six
questions on a commute currently loses to a tunnel.

**Constraints — the reason this is behind Track A.**

- `moxy.config.json` must never be served stale from a cache, or an app
  update can't move the server address. Network-first for that file, always.
- Caching an app whose entire premise is "nothing identifying is stored"
  needs a deliberate answer about what the cache holds and how logging out
  clears it.
- `npm run e2e` drives the production build; a service worker changes what
  that build serves and the suite will need to account for it.

**Size.** Medium, with a long tail of caching bugs. Do it when the loop
above it works.

### D2 · Sharing and printing the result

**What.** Web Share API for phrases and links on mobile (with the current
copy-to-clipboard as fallback), and a print stylesheet for the compare view.

**Why.** People will want to bring a comparison to a conversation, and a
printout is the one form that doesn't require both people to hold a phone.
The B1 print stylesheet does most of the work.

**Size.** Small.

### D3 · Internationalization groundwork

**What.** Extract user-facing strings from the inline templates so a
translation becomes possible. No translation yet.

**Why.** Every component shipped with inline copy raises the price of the
first translation. This is the cheapest it will ever be, and it only gets
worse.

**Caveat.** It touches nearly every component, so it wants a quiet window
between features rather than a slot in a wave.

**Size.** Large and boring. Schedule honestly or not at all.

---

## Sequencing

**Wave 1 — the loop.** A1 freshness · A3 viewer CTA · C1 focus and
announcements. The two ends of the share loop, plus the accessibility fix
that costs almost nothing and unblocks the most people.

**Wave 2 — the front door.** A2 demo compare · B1 backup card · B2 phrase
entry. What a newcomer meets, and what keeps them from losing everything.

**Wave 3 — the words.** C2 narrative panel · A4 core-tier milestone · B3
phrase confirmation. The copy-heavy work, once the structure around it is
settled.

**Wave 4 — the sweep.** C3 chart alternatives · C4 contrast · C5 control
audit. Best done together, as one audit with one vocabulary.

**Wave 5 — reach.** D1 PWA · D2 share and print. Multiply the loop after
it works.

**Unscheduled.** D3 i18n.

## Invariants this plan touches

None of it touches the frozen crypto vectors, the append-only survey schema,
or the wordlists. Two items come close and are worth stating plainly:

- **A1** adds fields to `SavedConnection` inside `PrivData`. They must be
  optional so `migratePrivData` keeps opening older blobs without a `v` bump.
  Adding a required field there is a migration, and a migration on the
  edit-key blob is the one that can lock someone out of their own profile.
- **A2** bundles fixture payloads built from real schema ids. They need a
  spec that fails when the schema moves under them, or the demo silently
  rots into a lie about the product.

Everything else is presentation, input handling, and copy.

## Deliberately not doing

- **Accounts, logins, or notifications.** The async gap is real, but any
  push channel needs an address to push to, and there isn't one by design.
  A1 is the honest version of this feature.
- **Free-text anything.** No bios, no messages, no custom questions. "There
  isn't even a free-text field" is load-bearing: it is what makes every
  answer comparable and every profile unidentifiable.
- **Server-side matching or discovery.** A directory of profiles is a
  different product with a different threat model, and it would put the
  server in a position the current design spent a lot of effort denying it.
- **Retention mechanics.** Streaks, reminders, and re-engagement nudges all
  need to know who you are and when you left. Transience is a feature here;
  the GC policy says so out loud.
