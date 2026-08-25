# Menagerie — working notes for coding agents

Anonymous compatibility profiles. Angular 22 workspace: a framework-free
domain core, a design-system lib, a static-site app, and a zero-dependency
Node profile server. README.md explains the product and threat model;
CONTRIBUTING.md carries the non-obvious invariants. This file is about how
to work in the tree.

## Verification ladder

Run what your change touches while iterating; everything must be green
before you're done — CI runs exactly this:

```sh
npm run format:check      # prettier (npm run format fixes)
npm run typecheck:server  # tsc over server/ — vitest strips types unchecked
npm run typecheck:scripts # tsc over scripts/ — no suite runs them
npm run test:core         # libs/core, plain Node
npm run test:ui           # libs/ui pure modules, plain Node
npm run test:app          # Angular components, vitest + jsdom
npm run test:server       # real HTTP + SQLite integration
npm run build             # ng build — also the app's real typecheck
npm run e2e               # Playwright vs the PRODUCTION build; build first
```

`npm test` = the four unit suites. `ng build` is the only step that
type-checks templates — run it even for "trivial" component edits.

## Layout and dependency rules

- `libs/core` (`@moxy/core`) — pure TypeScript domain: schema, phrase
  minting + KDF, crypto envelopes, match scoring, personas, HatchClient.
  Zero framework imports; `no-angular.spec.ts` fails the build otherwise.
- `libs/ui` (`@moxy/ui`) — SCSS tokens/base partials plus standalone
  components (charts, widgets). May import `@moxy/core`, never `src/app`.
- `src/app` — routes, signal stores under `stores/`, feature components.
  Persistence, crypto, and server I/O belong in stores or core, not in
  components; components hold view state and delegate.
- `server/` — plain TS run by Node directly (type stripping, `node:sqlite`,
  no npm deps). It imports ONLY the dependency-free wire-contract files
  from core (`*-api.ts`, `hatch/constants.ts`) by relative path; each such
  import needs a `COPY` in `deploy/Dockerfile` (deploy.spec.ts guards it),
  and everything server-reachable stays erasable-syntax-only (no enums, no
  parameter properties).
- Barrels (`libs/*/src/index.ts`) export only what has an external
  consumer. Internal helpers stay module-private; specs import module files
  directly.

## Frozen contracts — never "fix" these

- Crypto vectors in `crypto/phrase-kdf.spec.ts` and `hatch/hatch.spec.ts`
  pin every credential derivation. If they break, your change is wrong.
- The survey schema (`schema/sections.ts`) is append-only: ids are forever
  (retired ids never reused), options never reorder. The freeze fixtures
  (`schema-v*.freeze.json`) enforce it.
- Wordlists (`persona/wordlists.ts`, `persona/tail-wordlists.ts`, the EFF
  list) are append-only; index-aligned tables (`ADJ_B_HUES`,
  `ANIMAL_HABITATS`) must grow in the same commit, guarded by specs.
- The entropy ledger in `hatch/phrases.ts` must be recomputed before
  anything new derives from a view phrase's tail.
- Internal identifiers keep the historical `moxy` name (env vars, headers,
  `@moxy/*` aliases, storage keys, `dist/moxy`). User-facing text says
  Menagerie. Don't migrate either direction.

## Conventions

- Formatting is Prettier's (`.prettierrc`); don't hand-format. The vendored
  EFF wordlist is `.prettierignore`d — leave its layout alone.
- Components: standalone, `ChangeDetectionStrategy.OnPush`, signal
  `input()`/`output()` — no decorators for I/O, no `NgModule`s. Single-file
  components with inline templates (only the root `App` differs). Selector
  prefix `moxy-`. Derive view values with `computed()` rather than method
  calls in templates.
- Compare panels are a marked extension point: `*.panel.ts` files under
  `src/app/compare/panels/`, registered via `provideComparePanel` in
  `app.config.ts`; the panel receives a precomputed `CompareModel`.
- Reuse the shared helpers rather than re-rolling them: `answerChips`,
  `interestLabel`, `importanceLabel`, `SCALE_MAX`, `currentEpoch`,
  `fetchViewPayload` (core); `clamp01`, `pct`, `seriesVar`, `MAX_COMPARE`,
  `errorText`, `ToastService.error`/`.copy`, `moxy-subject-card` (ui);
  `server/db-util.ts` (server). If a third copy of something appears,
  extract it instead.
- Styling: design tokens and shared classes live in `libs/ui/src/styles/`;
  component `styles` are for genuinely component-local rules. Check
  `_base.scss` before writing an inline `style="…"`.
- Errors: user-facing failures surface via `ToastService`; stores throw,
  components catch. `HatchError` carries the typed failure taxonomy for
  server round-trips.

## Gotchas

- `ng test`/`ng build` need Node ≥ 22.22.3 (CI uses 24); the server needs
  Node with `node:sqlite` (≥ 22.5, warning-free on 24).
- The e2e suite spawns real servers and a real Chromium against
  `dist/moxy/browser` — it tests the last build, not your working tree.
- Argon2id derivations are deliberately slow (~seconds); e2e timeouts that
  look generous are load-bearing.
- The GC policy constants live in `hatch/constants.ts`, shared by server
  and in-app copy — change them in one place only.
