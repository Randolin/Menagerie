# The evidence plan — what to do when the product is finished and untested

The third plan. `feature-plan.md`'s sixteen items shipped; `adoption-plan.md`'s
five shipped after them. Everything since has been craft rather than plan: a
person palette that failed under simulated protanopia, a comparison page that
had grown nine equal cards, a view page that still had six, the last of the
`moxy` name, thirty kilobytes off the first paint, and an edit-phrase lockout
that a flaky test turned up two commits before it would have shipped.

The first plan's diagnosis was that the app served the first person and ignored
the space between two. The second's was friction at the edges of the loop. This
one's is harder to act on and worth stating plainly:

**Menagerie is complete against its own thesis, and it has never met a
stranger.** The loop closes. The doors are marked. The pages read as documents.
Every number is measured, every guard bites, and the whole of it has been
verified against two headless viewports and zero people.

That has one honest consequence, which is the spine of this document: **the
next real information about this product cannot be obtained by building
things.** So the items here are deliberately few and deliberately small. They
are the things that are cheap now and expensive later, plus the one thing the
product cannot currently do at all — hear back.

As before: a plan, not a commitment, and the grilling is part of the document
because most of what was considered did not survive it.

---

## The grilling

**A feedback channel** — survived, and it is the item that made this plan worth
writing. There is currently _no way for any person to tell the operator
anything_. Not a bug report, not "this question is worded badly", not "the QR
didn't scan on my phone". For a product about to meet its first cohort, that is
the gap that makes every other gap invisible. The grilling's only demand was
that it must not become a channel that identifies anyone: an off-site link,
nothing prefilled, no phrase, no locator, no persona name.

**Analytics beyond the existing metrics** — killed, and this is the third plan
to kill it. The opt-in epoch counters are already the honest ceiling: k-floored
buckets and randomized-response desire rates, computed so that what comes back
is a fact about a crowd and never about a person. A funnel is by construction
the other thing. If the choice is between knowing why someone left and being a
product that cannot know, this product picks the second, and picks it in a
document rather than by accident.

**"Someone viewed your profile"** — killed for the third time, same reason as
the first two: every version requires the server to learn who is waiting on
whom. Freshness on profiles you already hold remains the ceiling.

**Discovery, search, a directory** — killed. Anonymous-by-design makes
discovery the anti-feature, not a missing one. The unit of distribution is one
person handing another a phrase, and that is the product.

**More survey questions** — killed pending evidence. Eighty-eight items across
eight sections, a twenty-three item core: adding to that without a single real
answer set is guessing dressed as work. The schema is append-only, so this door
never closes and nothing is lost by waiting.

**A plaintext profile export** — killed on the same argument that shaped
`DraftStore` and the encrypted draft vault. A JSON dump of someone's intimate
answers, sitting in a downloads folder unencrypted, is precisely the artifact
this app spent its design budget avoiding. The backup card already carries the
thing that is actually irreplaceable.

**Recovering a profile minted with a hyphenated edit phrase** — killed, on
purpose, with the reasoning recorded so it can be reversed if it ever stops
being true. Four EFF words (`drop-down`, `felt-tip`, `t-shirt`, `yo-yo`) made a
five-word phrase measure as six; minting no longer picks them, but a phrase
already minted with one is refused at the door even though the KDF would open
it. A recovery path means teaching the guard to re-join adjacent tokens by
guessing where a hyphen used to be — ambiguity added to the most
security-sensitive input in the app, to serve zero production profiles and a
handful of regenerable dev fixtures. If a real profile ever turns out to hold
one, this is a half-hour of work and the reasoning above is what has to change
first.

**Account recovery** — killed permanently, as it always has been. There is no
account. That is the premise, not a limitation, and the app says so.

**A shipped translation and a language picker** — still blocked, still on a
person rather than a task. The rails are built, the catalogue is one file, and
this session closed twenty-two more strings that a translator could not have
reached. What is missing is a native speaker fluent in the communities the
About page names, willing to review intimate copy. The picker is furniture
until they exist.

---

## The items

### F1 · Somewhere to send a sentence

**What.** One line, in Settings and in the About page's footer: a link to an
off-site form or inbox where anyone can say something. Nothing prefilled.

**Why.** Because the alternative is that the first cohort's entire experience
is invisible, and every later decision gets made on the same evidence base as
this one — none. It is also the cheapest item in the document by an order of
magnitude.

**Constraints.**

- Nothing about the sender travels with the click: no phrase, no locator, no
  persona name, no epoch, no referrer that carries a fragment. A plain link,
  and the fragment never leaves the client anyway — that is worth verifying
  rather than assuming.
- Off-site. A first-party form means a server that stores what people type,
  which is a new class of stored data in a product whose whole claim is that
  it stores ciphertext it cannot read.
- Phrased as an invitation, not a plea, and never interrupting anything.

**Done when** both surfaces carry it, the string is marked and extracted, and
the outbound request is confirmed to carry nothing identifying.

**Size.** Tiny.

### F2 · Finish the reading surfaces

**What.** The comparison and view pages now read as one document: a hero card,
then panels in a single text column. Landing, About, Community, Groups and
Settings still stack equal cards. Audit them and apply the same treatment where
the page is something to _read_.

**Why.** Two pages were reworked because nine equal cards meant nothing was
emphasised. The same argument applies to the rest by construction; leaving it
half-applied is worse than either state, because the app now contradicts itself
between routes.

**Constraints.**

- **Editing surfaces keep their cards.** The dashboard's category cards carry
  Hide/Remove controls; there the chrome is the affordance, not decoration.
  The rule the reworks established is "a card is emphasis, and a control earns
  a box" — it is not "fewer cards everywhere".
- About is a long read and may want a different answer from Settings, which is
  a list of switches. This is an audit with a per-page verdict, not a
  find-and-replace.
- No new copy. If a page needs rewriting, that is a different item.

**Done when** each page has a recorded verdict (reworked, or deliberately left
with the reason), and the screenshot set covers whatever changed.

**Size.** Medium.

### F3 · The click between hatching and answering

**What.** A freshly hatched profile shows the edit-phrase alert, the share card,
and then `+ Add a category — 8 left to add, all optional`. There is nothing to
answer until a category is chosen. The question this item asks — and it is a
question — is whether the core set should already be there.

**Why, and why it is not a certainty.** The core set is the thing the copy
promises ("about five minutes"), and requiring an act of curation before an act
of answering is a plausible place to lose someone. It is equally plausible that
choosing what to talk about is the moment the product feels like it belongs to
you, which is a real thing to protect. Nobody here knows which, and F1 is the
item that would eventually tell us.

**Constraints.**

- Whatever ships must not take the choice away. "All optional" is a promise the
  page currently keeps.
- No progress gamification. The existing marker states a count and a bound and
  stops there, deliberately.

**Done when** a decision is recorded either way — including "left as-is,
because". A recorded decision not to change something is a complete outcome for
this item.

**Size.** Small to build, and it should not be built before it is decided.

### F4 · Meet a real device

**What.** Drive the whole loop on actual hardware: hatch, answer, share a QR,
scan it from another phone, compare, boop back. iOS Safari and Android Chrome
at minimum.

**Why.** Everything to date has been verified in one headless Chromium at 1180px
and 390px. That is a good harness and it cannot see the class of bug that only
real devices have: Safari's clipboard permissions on the copy-phrase button,
the Web Share fallback when the share sheet is declined, `100vh` under a mobile
URL bar, a camera that will not focus on a QR at the size we render it — and
the one that would actually hurt, **Argon2id at 64 MiB × 3 passes on a low-end
phone**. That parameter was chosen for attacker cost. Nobody has measured what
it costs a four-year-old Android holding its breath for a login.

**Constraints.**

- If the KDF turns out to be unusable on real low-end hardware, the parameters
  are **not** a free variable: they are a frozen KDF input, and changing them
  makes every existing profile unopenable. The honest outcomes are a better
  progress affordance, or a versioned second derivation for new profiles — not
  an edit. Establish the number before discussing the fix.
- This needs a person with phones. It is the one item in this document that
  cannot be delegated to CI.

**Done when** the loop is confirmed end-to-end on both platforms and the
Argon2 timings are written down.

**Size.** Small in effort, largest in what it could reveal.

### F5 · The server that is up but wrong

**What.** Extend the e2e past "offline" into the states a real deployment
actually produces: a 500, a timeout, a slow link, a CAS conflict, a request
that succeeds after a retry.

**Why.** `HatchError` carries a typed failure taxonomy and
`hatchFailureMessage` turns every kind into a sentence, but the suite only
drives the network-is-gone path. The rest of that taxonomy is asserted by
construction and has never been executed — which is the same position the
offline path was in before it turned out that `setOffline` does not cut
loopback in Chromium.

**Constraints.**

- Faults get injected at the route level, the way the offline test learned to
  do it. No test-only branches in product code.
- Every path must end at a sentence a person could act on, not a toast reading
  `hatch network`.

**Done when** each `HatchFailure` kind is driven at least once and lands on its
own message.

**Size.** Medium.

---

## Sequencing

**Wave F-1 — hear something.** F1 alone, immediately. Every other item on this
list is better decided with even one message in hand, and it is an afternoon.

**Wave F-2 — the craft debt.** F2 and F5. Both are finishing work on things
already started, both are verifiable here, and neither needs anyone's
permission.

**Wave F-3 — the unknowns.** F4, then F3 with whatever F4 and F1 taught. F3 is
last on purpose: it is the only item that changes what a new person is shown,
and it is the item this document is least confident about.

## Invariants this plan touches

- **F1 must not make a link identify its sender.** The fragment stays
  client-side; that is a property to verify, not to assume.
- **F4 must not treat the KDF parameters as a tuning knob.** They are a frozen
  input. A slow login is a UX problem until somebody proves otherwise, and the
  fix for it is a versioned derivation, never an edit.
- **F2 must not confuse "a reading surface" with "an editing surface".** The
  dashboard's cards are load-bearing.
- **Every new string** goes through the D3 rails, which now include bound
  attributes — `i18n-copy.spec.ts` reads those since twenty of them turned out
  to be untranslatable.

## Deliberately not doing

- Analytics beyond the k-floored opt-in counters. Third plan, third refusal.
- Anything that tells one person whether another looked.
- Discovery, search, or a directory.
- New survey questions before there are real answers to the existing ones.
- A plaintext export of anyone's answers.
- A recovery path for edit phrases minted with the four hyphenated EFF words,
  unless one turns up outside a dev fixture.
- A machine-drafted translation, or a picker offering one language.
