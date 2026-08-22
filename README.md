# Moxy

**Anonymous compatibility profiles for every kind of connection.**

Moxy is a compatibility survey you fill out once and share as a link or QR
code. Lay two or more profiles side by side and see where you overlap, where
you differ, and — for the optional desires section — what you *both* said yes
to, revealed only on a mutual match. Inspired by tools like Mojo Upgrade and
collaborative kink lists, generalized to every relationship shape: friendship,
chosen family, monogamy, marriage, polyamory, swinging, relationship anarchy,
hookups, asexual and queerplatonic partnership.

No accounts. No servers. No analytics. Nothing that can be traced back to you.

Built as an Angular 22 + TypeScript workspace with a framework-free domain
core — but it still ships as a fully static site.

## How it works

- **The link is the database.** Your answers are compressed (deflate) and
  encoded into the URL *fragment* (`#p=m1.…`). Browsers never send fragments
  over the network, so not even the host serving these files sees a profile.
  The QR code is the same link, drawn as squares. Links are minted with the
  same `m1.` format the original vanilla-JS Moxy used, so profiles open on
  any deployment, old or new.
- **Mutual-only desires.** Answers in the desires section never travel as
  readable data. Positive answers become salted hash fingerprints, padded and
  shuffled; the compare view reveals a desire only when both profiles carry a
  fingerprint for it. "Not for me" answers are never encoded in any form.
  (Honest limit, also stated in-app: with no server as referee, a determined
  recipient of a link could dictionary-test the small answer space — the
  mechanism is a polite curtain, not cryptographic secrecy.)
- **A login with no identity.** The vault generates a five-word diceware
  passphrase (EFF large wordlist, ≈65 bits). PBKDF2-SHA-512 (300k rounds)
  derives a storage locator and an AES-256-GCM key from it; your profiles and
  saved connections are stored encrypted in `localStorage`. The passphrase is
  displayed once and stored nowhere. Lose it and the vault is gone — that's
  the design. Share links and the passphrase are unrelated credentials.
- **Zero-knowledge sync (opt-in).** The same KDF also yields a random 128-bit
  *locator* and a *write token*, so a vault can follow its passphrase to any
  device: the sync server stores only `locator → ciphertext + version` plus
  the SHA-256 of the write token. No account, no email, nothing readable, no
  IPs persisted. Enter the passphrase (plus the server address) on a new
  device and the encrypted vault is fetched, decrypted locally, and opened.
  Devices merge concurrent edits deterministically (last-write-wins per item,
  tombstones so deletions never resurrect). Local-only remains the default.
- **Compare 2–4 profiles.** Value alignment on dot strips, a mutual-interest
  matrix of connection types, per-section alignment meters, pairwise affinity
  for groups, a full side-by-side answer grid, and mutual-desire reveals.

## Development

Requires Node ≥ 22.22.3 (Node 24 LTS recommended) and npm.

```sh
npm install
npm start            # dev server on http://localhost:4200
npm run test:core    # domain-library tests (plain Node, no browser, no Angular)
npm run test:app     # Angular component tests (vitest + jsdom)
npm run test:server  # sync-server integration tests (real HTTP, in-memory DB)
npm run build        # production build → dist/moxy/browser
npm run e2e          # drives the PRODUCTION build in Chromium, spawning the
                     # sync server for the two-device tests (build first)
npm run server       # run the sync server (see below)
```

### Architecture

```
libs/core   @moxy/core — pure TypeScript domain library, zero framework imports
            (schema, payload codec, match-token + vault crypto, scoring).
            A guard spec fails the build if anything Angular sneaks in.
libs/ui     @moxy/ui — the design system: SCSS token/base partials and
            standalone chart components (dot strips, interest matrix, meters…).
src/app     The Angular app: hash routing (static-host friendly, legacy-link
            compatible), signal stores (draft/vault/compare/theme/sync), views.
server      The optional sync server: plain TypeScript run directly by
            Node ≥ 24 (native type stripping + node:sqlite), zero deps.
e2e         Playwright suite run against the production build via a dumb
            static file server — no rewrites, proving the no-server property —
            plus real two-device sync tests against a spawned sync server.
```

### Extending it

- **New survey question:** append an item to a section in
  `libs/core/src/schema/sections.ts` (options are append-only; ids are
  forever). Old links keep working — the schema freeze test
  (`schema-v1.freeze.json`) enforces this in CI.
- **New question *type*:** add it to the `Item` union, then the compiler
  walks you to the three registries (similarity, item editor, answer
  renderer) via exhaustiveness checks.
- **New compare visualization:** write one standalone panel component and
  register it with `provideComparePanel({...})` in `src/app/app.config.ts` —
  order and visibility are declared there; the panel receives a precomputed
  `CompareModel`.
- **Payload format changes:** bump `PROFILE_VERSION` and add an upgrader in
  `libs/core/src/codec/migrate.ts`; old prefixes stay decodable via the
  prefix registry in `codec.ts`.

### Compatibility contract

Links produced by the original vanilla-JS Moxy decode byte-identically —
enforced by fixtures in `libs/core/src/codec/fixtures/` that were generated
by the legacy implementation itself, plus an e2e spec that opens legacy
`#p=`/`#c=` URLs. Storage keys (`moxy.vault.v1.*`, `moxy.draft.v1`,
`moxy.theme`) are unchanged, so existing browsers' vaults survive.

## Deploying

Pushes to the default branch deploy the app to **GitHub Pages** automatically
via `.github/workflows/deploy.yml` (after a one-time Settings → Pages →
Source: "GitHub Actions" toggle). Manual alternative:

```sh
npx ng build --base-href ./
# copy dist/moxy/browser/* to any static host
```

Hash routing means no server rewrites are needed — GitHub Pages, Netlify, an
intranet share, anything that serves files works. The app is fully functional
without any sync server. For the optional sync server there are ready-made
**Docker** and **systemd + Caddy** recipes in [`deploy/`](deploy/README.md).

### The sync server (optional)

```sh
node server/moxy-sync-server.ts     # Node >= 24; no npm install needed
```

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | listen port (`0` = ephemeral, printed as JSON) |
| `MOXY_DB_PATH` | `./moxy-sync.db` | SQLite file (`:memory:` for testing) |
| `MOXY_MAX_BLOB_BYTES` | `262144` | encrypted-vault size cap |
| `MOXY_TRUST_PROXY` | unset | `1` to honor `X-Forwarded-For` for rate limits |

Run it behind a TLS reverse proxy. The API is four routes:
`GET /v1/health` · `GET /v1/vault/:locator` · `PUT /v1/vault/:locator`
(headers `X-Moxy-Write-Token` + `If-Match: <version>`, `0` creates; `409`
returns the current state for client-side merge) · `DELETE /v1/vault/:locator`.
The table stores `locator → token-hash, ciphertext, version` with timestamps
rounded to the hour; IPs live only in the in-memory rate limiter.

Threat model in one paragraph: the server can't read vaults (AES-256-GCM,
key never leaves the client), can't reverse a locator into a passphrase
(one-way 300k-round KDF), and can't be enumerated (128-bit locators). Someone
who *observes* a locator — including a malicious operator — can deny
availability by deleting or squatting that slot; they can never read or forge
data, the client detects it as a decryption failure, and changing the
passphrase moves the vault to a fresh locator. Self-host if you'd rather not
extend even that much trust.

## License

MIT. Dependencies of note: [qrcode-generator](https://www.npmjs.com/package/qrcode-generator)
(MIT, Kazuhiko Arase); EFF large wordlist (CC-BY 3.0), embedded as a lazy chunk.
