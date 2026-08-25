# Menagerie

**Anonymous compatibility profiles for every kind of connection.**

Menagerie is a compatibility survey with no identity attached. **Hatch** a profile
and it exists instantly — a creature name, a QR code, and two phrases — before
you've answered a single question. Answer themed question categories at your
own pace, share your **view phrase** (or its link/QR), and lay profiles side by
side to see where you overlap, where you differ, and — for the optional
desires section — what you _both_ said yes to, revealed only on a mutual
match. Inspired by
tools like Mojo Upgrade and collaborative kink lists, generalized to every
relationship shape: friendship, chosen family, monogamy, marriage, polyamory,
swinging, relationship anarchy, hookups, asexual and queerplatonic
partnership.

No accounts. No email. No names. No analytics. There isn't even a free-text
field: every answer is a selection from fixed options, so nothing you can
type into a profile can identify you — and every answer is comparable and
plottable. The server stores only ciphertext it can never read — plus, for
profiles that explicitly opt in, coarse anonymous monthly counters (the one
deliberately readable table; see the metrics bullet below).

Built as an Angular 22 + TypeScript workspace with a framework-free domain
core; the app ships as a static site, the server is one dependency-free
Node file.

## How it works

- **Two phrases are the whole identity.** Hatching mints a 6-word **view
  phrase** (`mellow-verdant-lobster-mistwoven-emberlit-fernhollow` — share it
  as text, link, or QR) and a 5-word **edit phrase** (yours alone, ~65 bits,
  EFF wordlist). Each runs through Argon2id (memory-hard: 64 MiB × 3 passes)
  to derive an opaque 128-bit locator and an AES-256-GCM key. The server sees
  locators and ciphertext — never a phrase, a key, or an answer. Lose the
  edit phrase and the profile can never be edited again; that's the design.
- **Your creature is your view phrase.** The first three words are the
  profile's persona — name, first-party pixel-art portrait, and QR styling
  (blob-merged modules in a two-hue gradient: the persona color plus a hue
  from the color-word slot) — so everyone you share with recognizes the same
  creature. All portraits live at `/creatures`. Honest arithmetic: those words are public by
  design, so a view phrase's secret is its poetic 3-word tail, drawn from
  curated 4,096-entry lists (exactly 36 bits ≈ GPU-months-to-a-year to
  brute-force at Argon2id's memory cost) — a curtain for casual reading,
  while edit control rests on the full-strength edit phrase. The persona's
  accent color derives from the public head words only. The location banner is
  the one thing that reflects the tail: it renders the landform _family_ of the
  final word (1 of 12, ~3.55 bits) and never the word, to viewers who already
  hold the phrase. Growing the lists from 2,048 bought +3 bits to pay for that,
  so effective tail secrecy is ~32.4 bits against ~33 before — near-neutral, in
  exchange for a place you can picture. The ledger lives in `hatch/phrases.ts`
  and must be recomputed before anything else derives from the tail. "New creature" re-mints the view phrase; every old link,
  QR, and desire fingerprint dies with it.
- **Weights instead of essays.** Anything that would have been a "must-have"
  paragraph is a per-item importance mark — _matters_, _matters a lot_, or
  _dealbreaker_ with the options you could live with. Comparison scores are
  weighted per direction ("fit for you" vs "fit for them"), a violated
  dealbreaker is called out by name, and care given/received is scored as an
  interlock (what one needs vs what the other gives), not similarity.
- **Mutual-only desires.** Desires never travel as readable data. Positive
  answers become salted hash fingerprints, padded and shuffled; comparing
  reveals a desire only when both profiles carry a fingerprint for it. "Not
  for me" answers are never encoded in any form. (Honest limit, also stated
  in-app: someone who can view your profile could dictionary-test the small
  answer space — a polite curtain, not cryptographic secrecy.)
- **Instant profiles, gentle housekeeping.** Profiles exist from the moment
  you hatch. Ones that never save an answer are garbage-collected after
  **7 days**; populated profiles untouched _and_ unviewed for **12 months**
  are collected too. Any save or view resets the clock. The policy constants
  live in one module shared by the server and the in-app warning copy.
- **Groups.** A shared, encrypted roster with its own creature and invite QR.
  Members deposit a snapshot of their open answers — pseudonymously (a random
  two-word alias, no view link) or openly (creature + view link) — and anyone
  holding the group phrase compares across the roster client-side. Desires
  never enter a group in any form. The creator's separate admin phrase kicks,
  re-mints (the unlink lever — old links, QRs, and deposits all die), and
  deletes. Honest limits, also stated in-app: kicking removes data but not
  group-phrase access, and the server sees roster sizes and join timing.
- **Boops: anonymous first contact.** A boop is a sealed "I'm interested,"
  not a message: intents from a fixed list (no free text anywhere), sealed to
  the recipient's public key (ephemeral-static ECDH P-256 → HKDF → AES-GCM)
  and padded to one fixed size, so the server, other viewers, and a stolen
  database alike can neither read a boop nor tell what it carries. Escalation
  is structural — optionally attach your view phrase, or a contact card
  (platform from a fixed list + a short handle) behind an explicit
  de-anonymization advisory. The recipient replies at most once through a
  one-shot reply box minted by the sender, or deletes silently. A sealed boop
  authenticates nothing about its sender (the UI says "says it's from");
  regenerating your creature rotates the boop address and is the block lever.
  Honest limits, also stated in-app: the server sees that an inbox received
  sealed notes, when (hour-coarse) and how many; inboxes cap at 16 pending
  with a 4-per-hour arrival throttle, and unread boops expire after 30 days.
- **Anonymous counters (opt-in, off by default).** Once per monthly epoch an
  opted-in profile submits coarse buckets — age band, plus answers
  joint-counted against it — under a dedup token derived in its own KDF
  domain, unlinkable to any locator. Desire bits ride randomized response
  (25% flip probability), so single submissions are deniable even to the
  operator; aggregates debias client-side. Served k-floored (buckets under
  10 hidden) on the in-app community page; epochs replace, never accumulate.
- **Compare 2–4 profiles.** A values-fingerprint radar overlay, value
  alignment on dot strips, a mutual-interest matrix of connection types,
  directional fit scores with dealbreaker alerts and coverage counts,
  pairwise affinity for groups, a full side-by-side answer grid, and
  mutual-desire reveals — fetched and decrypted entirely client-side,
  deliberately transient.

## Development

Requires Node ≥ 22.22.3 (Node 24 LTS recommended) and npm.

```sh
npm install
npm start            # dev server on http://localhost:4200
npm test             # all four unit suites (core, ui, app, server)
npm run test:core    # domain-library tests (plain Node, no browser, no Angular)
npm run test:ui      # UI-library pure-module tests (plain Node)
npm run test:app     # Angular component tests (vitest + jsdom)
npm run test:server  # profile-server integration tests (real HTTP, SQLite)
npm run typecheck:server  # tsc over server/ (vitest strips types unchecked)
npm run format       # prettier --write (format:check is what CI enforces)
npm run build        # production build → dist/moxy/browser
npm run e2e          # drives the PRODUCTION build in Chromium against a real
                     # spawned profile server (build first)
npm run server       # run the profile server (see below)
```

For local development, point the app at a local server: run
`npm run server`, then in the app's landing page (or DevTools) set
`localStorage['moxy.server.v2'] = 'http://127.0.0.1:8787'`. Deployments read
`moxy.config.json` instead — see Deploying.

### Architecture

```
libs/core   @moxy/core — pure TypeScript domain library, zero framework
            imports (schema, phrase minting + KDF, blob envelope, match
            tokens, scoring, HatchClient). A guard spec fails the build if
            anything Angular sneaks in.
libs/ui     @moxy/ui — the design system: SCSS token/base partials and
            standalone chart components (dot strips, interest matrix,
            meters, styled QR…).
src/app     The Angular app: hash routing (static-host friendly, QR-scan
            deep links), signal stores (session/draft/compare/config/theme),
            landing → dashboard → add-and-edit category cards (with
            per-item importance controls), view + compare.
server      The profile server: plain TypeScript run directly by Node ≥ 24
            (native type stripping + node:sqlite), zero deps, GC sweeper.
e2e         Playwright suite run against the production build via a dumb
            static file server — hatch, the category cards, a
            dealbreaker round-trip, QR-scan bypass, edit-phrase recovery,
            compare with mutual/one-sided desires, regeneration, GC, and a
            zero-knowledge-at-rest scan of the raw database.
```

> **Historical note:** the codebase keeps its original internal name, `moxy`.
> Path aliases (`@moxy/core`), storage keys (`moxy.*`), env vars (`MOXY_*`),
> API headers (`x-moxy-*`), the config filename, and the server entrypoint are
> stable identifiers deliberately untouched by the rename to Menagerie —
> changing them would churn frozen crypto vectors and stored browser state
> for zero user benefit.

### Extending it

- **New survey question:** append an item to a section in
  `libs/core/src/schema/sections.ts` (options are append-only; ids are
  forever — including retired ids, which are never reused). Tag it
  `tier: 'core'` only if it belongs in the short first pass, and add a gate
  in `schema/gating.ts` if it should only be offered once earlier answers
  make it meaningful. Existing profiles keep decoding — the schema freeze
  test (`schema-v2.freeze.json`) enforces this in CI.
- **New question _type_:** add it to the `Item` union, then the compiler
  walks you to the three registries (similarity, item editor, answer
  renderer) via exhaustiveness checks.
- **New compare visualization:** write one standalone panel component and
  register it with `provideComparePanel({...})` in `src/app/app.config.ts` —
  order and visibility are declared there; the panel receives a precomputed
  `CompareModel`.
- **Payload format changes:** bump `PROFILE_VERSION` and add an upgrader in
  `libs/core/src/codec/migrate.ts` — stored view blobs are migrated on
  decrypt, so old profiles keep opening.

### Frozen contracts

The credential derivations are pinned by frozen test vectors
(`crypto/phrase-kdf.spec.ts`, `hatch/hatch.spec.ts`): if a change alters any
locator, token, key, or persona output, CI fails. Those values are the
identity of every hatched profile — fix the regression, never the fixtures.

## Deploying

Two pieces: the **static app** and the **profile server** (required for the
app to do anything — it's where the encrypted profiles live). Ready-made
Docker and systemd + Caddy recipes are in [`deploy/`](deploy/README.md).

Pushes to the default branch deploy the app to **GitHub Pages** automatically
via `.github/workflows/deploy.yml`, stamping the production server URL into
`moxy.config.json` from the `MOXY_SERVER_URL` repository variable
(Settings → Secrets and variables → Actions → Variables). Manual alternative:

```sh
npx ng build --base-href ./
echo '{"serverUrl":"https://api.menagerie.love"}' > dist/moxy/browser/moxy.config.json
# copy dist/moxy/browser/* to any static host
```

Hash routing means no server rewrites are needed anywhere, and a scanned QR
(`…#/view/<phrase>`) opens directly.

### The profile server

```sh
node server/moxy-sync-server.ts     # Node >= 24; no npm install needed
```

| Env                       | Default          | Meaning                                           |
| ------------------------- | ---------------- | ------------------------------------------------- |
| `PORT`                    | `8787`           | listen port (`0` = ephemeral, printed as JSON)    |
| `MOXY_DB_PATH`            | `./moxy-sync.db` | SQLite file (`:memory:` for testing)              |
| `MOXY_MAX_BLOB_BYTES`     | `262144`         | per-blob ciphertext size cap                      |
| `MOXY_TRUST_PROXY`        | unset            | `1` to honor `X-Forwarded-For` for rate limits    |
| `MOXY_MAX_PROFILES`       | `100000`         | circuit breaker: creates answer 503 beyond        |
| `MOXY_MAX_GROUPS`         | `10000`          | group circuit breaker                             |
| `MOXY_MAX_GROUP_MEMBERS`  | `32`             | deposits per group                                |
| `MOXY_MAX_BOOP_INBOXES`   | `200000`         | boop inbox circuit breaker                        |
| `MOXY_METRICS_K`          | `10`             | k-floor: aggregate buckets under this stay hidden |
| `MOXY_READS_PER_MINUTE`   | `120`            | per-IP GET budget                                 |
| `MOXY_WRITES_PER_MINUTE`  | `30`             | per-IP write budget                               |
| `MOXY_BOOPS_PER_MINUTE`   | `5`              | per-IP knock-POST budget                          |
| `MOXY_METRICS_PER_MINUTE` | `5`              | per-IP metrics-POST budget                        |
| `MOXY_GC_EMPTY_MS`        | 7 days           | never-populated profiles die after this           |
| `MOXY_GC_IDLE_MS`         | 365 days         | populated ones, after no edit _and_ no view       |
| `MOXY_GC_SWEEP_MS`        | 1 hour           | GC sweep interval                                 |

Run it behind a TLS reverse proxy. The API:
`GET /v2/health` ·
`POST /v2/profiles` (create; `X-Moxy-Edit-Token`; `409 locator_taken` → remint) ·
`GET /v2/profiles/view/:locator` (bumps the hour-coarse last-viewed stamp) ·
`GET /v2/profiles/edit/:locator` ·
`PUT /v2/profiles/edit/:locator` (`X-Moxy-Edit-Token` + `If-Match: <version>`;
optional atomic re-key via `new_view_locator` / `new_edit_locator` +
`X-Moxy-New-Edit-Token`; `409` carries the current blobs for client merge) ·
`DELETE /v2/profiles/edit/:locator` ·
groups: `POST /v2/groups` (`X-Moxy-Admin-Token`) ·
`GET /v2/groups/:locator` (roster; bumps last-viewed) ·
`PUT`/`DELETE /v2/groups/:locator` (admin; PUT re-keys via
`new_group_locator` + `X-Moxy-New-Admin-Token`) ·
`POST /v2/groups/:g/members` (`X-Moxy-Member-Token`) ·
`PUT`/`DELETE /v2/groups/:g/members/:m` (member token; admin may DELETE) ·
boops: `POST /v2/boops` (register a random inbox; locator + token in body) ·
`POST /v2/boops/:locator/knocks` (anonymous sealed drop, ≤ 4 KiB, own tight
rate bucket + per-inbox throttle; `503` when the 16-slot inbox is full) ·
`GET /v2/boops/:locator` (`X-Moxy-Boop-Token`; bumps the idle clock) ·
`DELETE /v2/boops/:locator[/knocks/:id]` (owner token) ·
metrics: `POST /v2/metrics` (epoch + dedup token + buckets) ·
`GET /v2/metrics/:epoch` (k-floored aggregate).
Tables: profiles (two locators, a token hash, two ciphertext blobs, a
version, hour-coarse timestamps), groups and group deposits (ciphertext and
token hashes), boop inboxes and their sealed knocks (random ids; unread
knocks swept after 30 days, unpolled inboxes after 12 months), and the
metrics counters — the one deliberately readable table, holding opt-in
coarse aggregates and hashed dedup tokens only. IPs live only in the
in-memory rate limiter.

Threat model in one paragraph: the server can't read profiles (AES-256-GCM,
keys never leave the client), can't reverse a locator into a phrase (one-way
memory-hard Argon2id KDF), and can't be enumerated (128-bit locators). What it _can_ do
— and the app's About page states this plainly — is observe timing, sizes,
and view/edit correlation, and deny availability by withholding or deleting
rows; it can never read or forge data, and clients detect tampering as a
decryption failure. Self-host if you'd rather not extend even that much
trust.

## License

**GNU AGPL-3.0-only.** Use it, study it, self-host it, fork it — and if you
run a modified version as a service, share your modifications under the same
license, so improvements stay in the commons that produced them. See
[LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md) (contributions are
inbound = outbound plus a maintainer relicensing grant).

Bundled dependencies of note: [qrcode-generator](https://www.npmjs.com/package/qrcode-generator)
(MIT, Kazuhiko Arase); EFF large wordlist (CC-BY 3.0), embedded as a lazy
chunk; the [Fredoka](https://fonts.google.com/specimen/Fredoka) display face
(SIL OFL 1.1, self-hosted under `public/fonts/` — no font CDN is ever
contacted). Their notices remain intact and their licenses are
AGPL-compatible. The pixel-art creature sprites are first-party and ship
under the project license.
