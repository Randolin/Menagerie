# Contributing to Menagerie

Thanks for wanting to help! Bug reports, privacy-model critiques, and pull
requests are all welcome.

## License and contribution terms

Menagerie is licensed under the **GNU AGPL-3.0-only** (see [LICENSE](LICENSE)).
By submitting a contribution you agree that:

1. Your contribution is licensed to the project under AGPL-3.0-only
   (inbound = outbound), and
2. You additionally grant the project maintainer a perpetual, irrevocable
   right to relicense or dual-license your contribution as part of the
   project — this keeps sustainable options (for example, funding the
   official hosted instance) open without ever weakening the AGPL grant
   everyone else receives.

If you can't agree to (2), say so in the PR and we'll talk — smaller
contributions may be fine to rewrite instead.

## Practical notes

- The full verification ladder must stay green — it is exactly what CI runs:
  `npm run format:check` · `npm run typecheck:server` · `npm test`
  (core, ui, app, and server suites) · `npm run build` · `npm run e2e`
  (build first).
- Formatting is Prettier's; run `npm run format` before committing rather
  than arguing with the checker.
- Survey schema changes are append-only (ids are forever, options never
  reorder) — CI enforces this against the schema freeze fixture.
- The frozen crypto vectors in `crypto/phrase-kdf.spec.ts` and
  `hatch/hatch.spec.ts` pin every credential derivation. If your change
  breaks them, the change is wrong — never the fixtures.
- Storage keys (`menagerie.*`) and wire headers (`x-menagerie-*`) are durable
  interfaces: renaming a storage key logs everyone out, and renaming a header
  needs the app and the server deployed together. Version, don't rename.

## Invariants that aren't obvious from the code you're editing

- **The bundle budget is a regression alarm, not an aspiration.** `angular.json`
  warns at 550 kB and fails at 650 kB of _raw_ initial bytes, against a real
  figure of ~526 kB (~134 kB over the wire, which is the number a reader
  actually pays). Angular and the router dominate that: the larger of the two
  initial chunks carries no product copy at all. The old 500 kB warning was the
  framework's template default rather than a measurement of anything here, and
  it fired on every single build, which is how a build warning becomes
  invisible. Two things are deliberately deferred out of the initial graph and
  should stay that way: Argon2 (`crypto/phrase-kdf.ts` imports `hash-wasm`
  inside the async derivation — the landing page never derives, and every path
  that does is already waiting seconds) and `loadTranslations`
  (`i18n/locale.ts` imports `@angular/localize` only when a catalogue is
  actually being installed, which never happens for the source locale).
  Together they are ~32 kB off the first paint. Argon2's chunk is warmed on
  idle (`warmPhraseKdf`, called from `main.ts`) because the service worker
  caches what has been fetched and not what might be — deferring it without
  warming it would turn an offline unlock into a lockout. If the warning
  fires, find what got pulled eager rather than raising the number.

- The wire-contract files (`libs/core/src/*/{hatch,group,metrics,boop}-api.ts`
  and `hatch/constants.ts`) must stay **import-free**: the server loads them
  by relative path, without npm installs or bundling.
- Every `../libs` import in `server/` needs a matching `COPY` line in
  `deploy/Dockerfile` — `server/deploy.spec.ts` fails if they drift.
- Everything the server runs must stay **erasable-syntax-only** (no enums,
  no parameter properties): Node executes the `.ts` files directly via type
  stripping. `npm run typecheck:server` compiles with the flag that
  enforces this.
