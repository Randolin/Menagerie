# The adoption plan — the loop's last mile, and the door

The successor to `feature-plan.md`, whose sixteen items all shipped. That
plan's diagnosis was structural: the app served the first person and ignored
the space between two people. This one's diagnosis is smaller and later in
the funnel, which is what progress looks like:

**The loop now works when someone drives it. What remains is friction at the
edges** — the message that arrives before the app does, the moment right
after the payoff, the cost nobody states up front, and doors that exist but
are unmarked. Every item here is UX and copy. No new cryptography, no server
changes, no schema changes.

As before: a plan, not a commitment. The grilling below is part of the
document because half of what was considered did not survive it, and the
reasons are worth more than the survivors.

---

## The grilling — ideas considered, and what happened to them

**Share-back after compare** — survived, sharpened. The one structural gap
left: A shares a phrase, B views, hatches, answers, compares, and _A ends the
story with nothing_ — no phrase, no signal, nothing to refresh. First
instinct was a notification-shaped fix, which the product forbids and rightly
so. But the mechanism already exists and is already the app's own designed
escalation ladder: a boop with the view phrase attached is precisely "here is
my creature back." What was missing was only the prompt at the moment of
maximum warmth — right after B's first comparison. The composer already
accepts a `target`; the compare page already holds the other party's payload,
which already carries boop reachability. This is a panel, not a feature.

**OG unfurl card** — survived, bounded. The first impression of Menagerie for
most second people is an unfurl in a chat app, and today it is a bare URL.
The grilling asked two things. _Per-creature cards?_ Impossible without SSR —
the phrase lives in the fragment, which never reaches a server — and SSR is
an architecture change this static-bundle product should not make for a
thumbnail. One good generic card is the whole item. _New privacy surface?_
No: preview fetchers already fetch the page; the fragment already stays
client-side; tags change what the fetch renders, not what is sent.

**Shipping a translation** — killed, deliberately, and this one hurt. The
i18n rails are built and a Spanish catalogue is one file away — but 648 of
these strings are intimate, carefully-argued copy where the vocabulary _is_
the product's respect for its audience ("If you are", "Not for me", the
desire labels, the honest ledgers). A machine-drafted translation of exactly
this copy, unreviewed by a native speaker fluent in the communities the About
page names, would be worse than English: it would read as a product that
stopped caring precisely where caring matters. The catalogue draft is cheap;
the review is the work, and it needs a human this plan does not have.
Recorded under "deliberately not doing", with the door left open.

**Language picker** — deferred with the translation. A picker listing only
English is furniture. The `?lang=` mechanism, the remembered choice, and
`rememberLocale()` already exist; the picker becomes a one-card Settings item
the day a second catalogue does.

**Time-to-payoff copy** — survived, shrunk to its true size. The core set is
23 items of taps — roughly five minutes — and nothing says so. People commit
to bounded tasks. The grilling's only demand: the number must be honest, so
it is "about five minutes", stated twice, never a countdown, never a
progress-percent gamification.

**Compare empty state** — survived. Compare-with-nothing is where a curious
person lands after hatching alone, and today it is an input with a
placeholder. It should teach the two moves available from that exact state:
see the demo pair, or share your phrase and come back. Two sentences.

**Install affordance** — survived at minimum volume. The PWA works and
nothing mentions it. The grilling killed every loud version (landing banners,
`beforeinstallprompt` interception on arrival) as off-brand for a product
whose front door is deliberately quiet. What remains: one line in Settings,
where people who already trust the app are.

**Manifest screenshots / richer install sheet** — killed. Real value near
zero; maintenance of screenshots that rot with every UI change, guarded by
nothing.

**"Seen" indicators, read receipts, share analytics** — killed before they
reached the table, same as last time. Every version requires the server to
learn who is waiting on whom. The freshness check remains the honest
ceiling for "what happened after I shared."

---

## The items

### E1 · Close the loop: send your creature back

**What.** After a comparison in which you took part, if the other profile can
receive boops and you arrived at it from outside your menagerie's history
with them, one quiet panel: _"They can't see you yet — send your creature
back."_ It hosts the existing boop composer targeted at them, with the
view-phrase attachment suggested (never pre-confirmed — attaching identity
stays a deliberate tick).

**Why first.** It is the last unlinked step in the viral chain, and it sits
at the exact moment the product has just proven itself to the person being
asked. Nothing else on this list changes the shape of the loop; this one
makes it a circle.

**Where.**

- `src/app/compare/compare.component.ts` — the panel, below the compare
  results, gated on `session.active()`, exactly two participants, the other
  payload carrying `k` (boop reachability), and the other party not being
  yourself.
- `src/app/boop/boop-composer.component.ts` — a `suggestAttachView` input so
  the CTA can open the composer with the checkbox visible and explained but
  unticked. The de-anonymization ladder is untouched.

**Constraints.**

- Never on the demo route — the demo pair cannot be booped and should not
  teach that they can.
- No memory of "already sent" beyond what `sentBoops` already holds; if a
  matching sent boop exists, the panel simply doesn't render. No new state.
- The copy must not imply the other person is waiting or watching. "They
  can't see you yet" states a fact about credentials, not about attention.

**Done when** a person who hatched from a scanned link can go from their
first comparison to the sharer holding their creature in two taps, the e2e
walks that exact path (B compares, boops back with phrase attached, A's
menagerie gains the creature), and the panel is absent on the demo and absent
when a boop was already sent.

**Size.** Medium. The most valuable item in this document. **Shipped**, with
two deviations the code argued for:

- **No `suggestAttachView` input.** The plan wanted the composer to open with
  the checkbox highlighted; an input that pre-ticks would break the very rule
  the item states, and one that merely draws attention is mechanism for
  nothing. The panel's copy names the tick instead — guidance with no code,
  and the composer is untouched.
- **The "already sent" gate had to be snapshotted, not read live.**
  `prepareBoop` writes the sent-boop ledger the moment the composer _opens_,
  not when it sends — so the obvious live read made the panel delete itself
  the instant anyone used it, taking their half-written boop and their
  "Booped!" confirmation with it. The e2e found this; no unit test would
  have, because it needs a real click. It is a `linkedSignal` keyed on the
  pair now, with an `untracked` ledger read that is load-bearing rather than
  decorative: a linkedSignal computation tracks everything it reads, so a
  plain read reintroduces the bug exactly.

### E2 · The unfurl card

**What.** OpenGraph and Twitter-card tags in `src/index.html`, plus one
static social image: wordmark, the one-line pitch, a handful of creatures
from the real sprites. Generic by necessity and by design — every link to
any route unfurls as _Menagerie_, never as anyone's profile.

**Where.** `src/index.html`; the image generated into `public/` by extending
`scripts/sprite-sheet.ts`'s rendering rather than hand-exporting something
unreproducible.

**Constraints.** The card describes the product, not the sender ("Anonymous
compatibility profiles", not "Someone shared a profile with you") — a phrase
link and a landing link must be indistinguishable in an unfurl, because the
unfurl is visible to shoulders the phrase is not meant for.

**Done when** a `#/view/…` link and a bare link both unfurl with the card in
a chat client, and the image is regenerable from the repo.

**Size.** Small. **Shipped.** `npm run social-card` renders it through the
pinned Chromium the e2e already uses, from the real sprites, so it cannot
drift into showing creatures the app doesn't have. One thing the item missed:
`og:image` has to be absolute or most unfurlers ignore it, and the source
cannot hardcode a host because anyone may self-host this bundle — so the
deploy stamps it from a repo variable, exactly as it already does for the
profile-server URL, and an unset variable degrades the preview instead of
failing the build.

### E3 · Say what it costs

**What.** "About five minutes" on the two surfaces where someone decides
whether to start: the demo's hatch CTA ("Answer the core set — about five
minutes — then share your phrase") and the dashboard's core marker while
incomplete.

**Constraints.** Honest, static, unanimated. No timers, no percentages, no
"almost there!". The number is a promise about the core tier only; nothing
implies the full survey is short, because it isn't and shouldn't pretend
to be.

**Done when** both surfaces state the bound, the strings carry i18n markers,
and `i18n:extract` has run.

**Size.** Tiny. **Shipped**, and it turned up a second i18n miss: the core
marker was a multi-line ternary inside an interpolation, invisible to the D3
sweep's text-node pass for the same reason the boop composer's blurb was. Two
marked branches now.

### E4 · The compare page teaches its own empty state

**What.** When the compare page holds no profiles: with no session, point to
the demo ("see what a comparison looks like") beside the paste input; with a
session, add the second move ("share your phrase from your profile — when
they've answered, paste theirs here"). Two sentences, links to things that
already exist.

**Where.** `src/app/compare/compare.component.ts`.

**Done when** both variants render, are translatable, and the demo link is
absent once any profile is loaded.

**Size.** Tiny. **Shipped.**

### E5 · Mention the install

**What.** One line in Settings, beside the other on-this-device concerns:
"Menagerie can be added to your home screen — it opens faster and works
without a network." Phrased as fact, not plea; no browser-specific
instructions, which rot.

**Where.** `src/app/settings/settings.component.ts`.

**Size.** Tiny. **Shipped**, and it says what the cache actually holds rather
than promising offline access to profiles it can never have.

---

## Sequencing

**Wave E-1 — the circle.** E1 alone. It has the only real design work and
the only new e2e path, and it deserves an undiluted review.

**Wave E-2 — the door.** E2 + E3 + E4 + E5 in one pass: all small, all
front-of-funnel, one wave of copy-heavy diffs and one screenshot review.
**Shipped.**

Both waves are done. The one thing neither could do for itself is look at the
link-preview card, which is a judgement about a picture; it is checked into
`public/social-card.png` and regenerable.

**A follow-on the waves earned.** Three separate i18n misses of the same shape
turned up across E1 and E2 — string literals inside interpolated ternaries,
which no text-node pass can see and which the pseudo-locale only reveals to
someone looking at a screenshot. Rather than wait for a fourth,
`src/app/i18n-copy.spec.ts` now rejects that shape and unmarked static
attributes outright. It found **sixteen more on its first run**, in the
dashboard, groups, group and menagerie pages — which is the argument for
writing it: the sweep, the pseudo-locale and two rounds of review had all
walked past them.

The prerequisite (merging D1 + D3 so this plan starts from a green `main`) is
done — PR #30.

**Both waves shipped.** The successor is `evidence-plan.md`, whose diagnosis is
that there is nothing useful left to learn by building — and whose first item
is the one thing this product still cannot do, which is hear back.

That i18n follow-on has a sequel worth recording here, because it is the same
lesson a second time. The guard written after three misses said, in its own
comment, that a bound attribute was "caught by the interpolation rule or by the
reviewer" — but a binding is not an interpolation, so nothing checked them.
Twenty untranslatable strings were sitting in `[title]` and `[attr.aria-label]`
when someone finally looked: every chart's screen-reader description, the scale
editor's pip labels, both Remove buttons. A guard that names its own blind spot
in a comment has not closed it.

## Invariants this plan touches

None of the frozen contracts. Three softer ones worth stating:

- **E1 must not weaken the escalation ladder.** Attaching a view phrase to a
  boop stays an explicit, explained tick. A CTA may propose; only the person
  disposes.
- **E2 must not make links describe their senders.** The unfurl's job is to
  make the product legible, not the share traceable.
- **Every new string** goes through the D3 rails: `i18n` markers, extraction,
  and the pseudo-locale sweep. The first plan bought that discipline;
  this one pays into it.

## Deliberately not doing

- **A shipped machine translation.** The rails are built and waiting; the
  blocker is a native-speaker review of intimate copy, which is a person,
  not a task. When that person exists, the catalogue draft is an afternoon.
- **A language picker before a second language.** Furniture until then.
- **Per-creature unfurls.** Requires SSR; the fragment never reaches a
  server, and that is a feature.
- **Install prompts anywhere but Settings.** The front door stays quiet.
- **Anything that tells A whether B looked.** Still the honest ceiling:
  freshness on profiles you hold, silence about everyone else.
