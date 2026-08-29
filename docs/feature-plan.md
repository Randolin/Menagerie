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

- `menagerie.config.json` must never be served stale from a cache, or an app
  update can't move the server address. Network-first for that file, always.
- Caching an app whose entire premise is "nothing identifying is stored"
  needs a deliberate answer about what the cache holds and how logging out
  clears it.
- `npm run e2e` drives the production build; a service worker changes what
  that build serves and the suite will need to account for it.

**Size.** Medium, with a long tail of caching bugs. Do it when the loop
above it works. **Shipped** — see Wave 5 below for what the constraint about
the cache turned into, and why the offline draft did not cost the invariant
it looked like it would.

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

**Size.** Large and boring. Schedule honestly or not at all. **Shipped**, and
the item's framing was wrong in a way worth writing down — see below.

---

## Sequencing

**Wave 1 — the loop.** A1 freshness · A3 viewer CTA · C1 focus and
announcements. The two ends of the share loop, plus the accessibility fix
that costs almost nothing and unblocks the most people. **Shipped.**

**Wave 2 — the front door.** A2 demo compare · B1 backup card · B2 phrase
entry. What a newcomer meets, and what keeps them from losing everything.
**Shipped.** B3 (confirm the edit phrase at hatch) was left in wave 3 as
planned; it now has somewhere to send people.

**Wave 3 — the words.** C2 narrative panel · A4 core-tier milestone · B3
phrase confirmation. The copy-heavy work, once the structure around it is
settled. **Shipped.** B3 turned out to be half-built already — the
acknowledgement gate existed, and what it lacked was the destination this
plan's own wording named ("next to the backup-card link"), so that is what
it got rather than the retype challenge, which would have taxed the instant
hatch the plan also asks us to protect.

**Wave 4 — the sweep.** C3 chart alternatives · C4 contrast · C5 control
audit. Best done together, as one audit with one vocabulary. **Shipped.**

C5 found two things worth recording, since neither was what the item
predicted. It guessed the controls needed radio semantics; they do not —
every answer control here is deselectable (clicking the chosen option clears
it, because every question is optional), and ARIA radios may not behave that
way. `aria-pressed` toggles are the honest match, so the roles stayed and the
navigation changed instead. What was actually broken:

- **462 tab stops** in a fully expanded survey, one per option button — 70
  to cross "What I value" alone. A roving tabindex (`OptionGroupDirective`)
  makes each question one stop with arrows inside it.
- **The importance control exposed no state at all.** Which tier was
  selected lived in a highlight class, so a screen reader was told nothing.

Two more notes:

- The interest matrix needed nothing — it was already a real table with
  scoped headers and a visible level in every cell. Check before adding;
  a second table is worse for a screen reader than one.
- Contrast is measurable, so `libs/ui/src/styles/contrast.spec.ts` now
  measures it on every run. It found a failure by testing all four series
  hues that eyeballing two had missed.

**Wave 5 — reach.** D1 PWA · D2 share and print. Multiply the loop after
it works. **Shipped**, in two parts.

The first part was the shell: the app installs and survives losing the
network. The cache holds this origin's static files and nothing else — the
profile server is a different origin and is never touched — so there is no
"what does the cache know about me" question to answer, and logging out has
nothing to clear. The e2e proves both halves: the shell comes back offline,
and the cache contains no foreign origin.

The second part was held back deliberately, because "the survey fillable
offline" looked like it had to break an invariant `DraftStore` states
outright — answers are in memory only, "so a shared computer holds no
plaintext answers after the tab closes". Two honest shapes were recorded and
the trade was left to the product.

**It turned out not to be a trade.** The plan's second shape — encrypt the
draft under a key held in memory — was described as protecting a closed tab
but not a running one, which undersold it: the key in question is `editKey`,
derived from the edit phrase by Argon2id and never written anywhere. So the
draft goes to disk under it, and a closed tab leaves ciphertext that nobody
on the device can open until someone types the edit phrase again. The
invariant survives verbatim; the answers survive too. That also solved the
identity problem for free — a draft written under one profile's key simply
fails to decrypt under another's, so there is no identifier to store and no
way for the next person on a shared machine to inherit anything.

It ships off by default all the same, because the honest limit is the
interaction with the _other_ opt-in: tick "remember my edit phrase" as well
and this browser holds both the lock and the key. Settings says so, in place,
only when both are on.

Three things came out of building it that the item did not predict:

- **"Fillable offline" was mostly already true**, and the actual loss was at
  the end: the save fails, and `HatchError` shipped its machine token as the
  message, so the toast read `hatch network`. Every failure kind now has a
  sentence written for someone mid-edit, and `network` is a distinct
  `SaveState` — not an error — with a bar that says the answers are safe and
  a retry that fires on the browser's own `online` event. No poll: the About
  page promises no request while you are away, and that promise still holds
  because this is the click you already made, finishing.
- **`Blob.prototype.stream` was load-bearing and shouldn't have been.** Every
  encrypted blob went through a Blob to reach `CompressionStream`, which made
  the whole crypto layer unusable in the app's own jsdom suite. `compress.ts`
  now feeds the transform directly — same deflate-raw, two fewer APIs, and the
  vault's at-rest assertions can run as unit tests.
- **The cheap version of the disk test is a lie.** Writes are debounced, so an
  e2e that reads `localStorage` right after a click reads the blob from
  _before_ it and passes while proving nothing. It waits for the value to
  change now.

**Wave 6 — the words, addressed.** D3 i18n groundwork. **Shipped**, 648
strings, no translation.

The item said "extract user-facing strings from the inline templates", which
misses where the copy is. The survey schema is 296 of those 648 — more than
half of everything the product says — and it lives in `libs/core`, which may
not import a framework, while `$localize` comes from `@angular/localize`. So
Angular's extractor could never see the survey, and no amount of template
markup would have made a translation possible. That was the part that needed
designing, and it went first.

The keys turned out to be free. `schema/sections.ts` is append-only under a
checked-in freeze: ids are forever, options never reorder. So the schema
already holds a set of permanent identifiers, and keys built from them
(`it.<id>.o<index>`) cannot be invalidated by any edit the freeze permits —
relabelling and appending are exactly the edits that leave a key meaning what
it meant. The frozen file did not change at all: the English stays where it
is and doubles as the fallback, so a partial translation degrades one string
at a time instead of showing gaps.

Three things fell out of doing it:

- **Coverage is the whole problem, and it needs two different proofs.** A
  string nobody marked compiles fine, reviews clean, and is simply
  untranslatable. In core, a spec loads a bag where every key maps to a
  marker and fails if any rendered string comes back English. In the app, no
  spec can see it, so the e2e builds a pseudo-locale from the extracted
  catalogue and drives the real UI with it — English on screen is the bug,
  visible in a screenshot. A third guard, `schema-copy.spec.ts`, is a source
  scan in the style of `no-angular.spec.ts`: it rejects `item.label` and its
  friends outright, because that is how the layer gets bypassed in practice.
- **Runtime loading, not a build per locale.** This is a static bundle with
  hash routing on Pages; per-locale builds mean per-locale directories and a
  redirect. One fetch before bootstrap, paid only when a locale other than
  the source is wanted, and every failure resolves to English rather than
  rejecting — a missing catalogue must never be why someone can't open their
  profile.
- **The costs, stated.** `@angular/localize` and the message metadata put
  ~19 kB on the initial bundle, which was already 35 kB over its 500 kB
  warning budget and is now 54 kB over (the error budget is 1 MB). The
  template catalogue has no drift guard the way the domain one does — Angular
  ships no such check — so `npm run i18n:extract` after a copy change is a
  habit, not an enforced one; the e2e catches it only for the handful of
  strings it names.

**Nothing left unscheduled.** Every item in Tracks A–D has shipped. The
successor is `adoption-plan.md` — smaller, later in the funnel, and about
the loop's last mile rather than the loop.

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
