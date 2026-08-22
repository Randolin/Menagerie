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
npm run build        # production build → dist/moxy/browser
npm run e2e          # drives the PRODUCTION build in Chromium (build first)
```

### Architecture

```
libs/core   @moxy/core — pure TypeScript domain library, zero framework imports
            (schema, payload codec, match-token + vault crypto, scoring).
            A guard spec fails the build if anything Angular sneaks in.
libs/ui     @moxy/ui — the design system: SCSS token/base partials and
            standalone chart components (dot strips, interest matrix, meters…).
src/app     The Angular app: hash routing (static-host friendly, legacy-link
            compatible), signal stores (draft/vault/compare/theme), views.
e2e         Playwright suite run against the production build via a dumb
            static file server — no rewrites, proving the no-server property.
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

```sh
npx ng build --base-href ./
# copy dist/moxy/browser/* to any static host
```

Hash routing means no server rewrites are needed — GitHub Pages, Netlify, an
intranet share, anything that serves files works.

## License

MIT. Dependencies of note: [qrcode-generator](https://www.npmjs.com/package/qrcode-generator)
(MIT, Kazuhiko Arase); EFF large wordlist (CC-BY 3.0), embedded as a lazy chunk.
