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

- The full verification ladder must stay green:
  `npm run test:core` · `npm run test:server` · `npm run test:app` ·
  `npm run build` · `npm run e2e` (build first).
- Survey schema changes are append-only (ids are forever, options never
  reorder) — CI enforces this against the schema freeze fixture.
- The frozen crypto vectors in `crypto/phrase-kdf.spec.ts` and
  `hatch/hatch.spec.ts` pin every credential derivation. If your change
  breaks them, the change is wrong — never the fixtures.
- Internal identifiers keep the historical `moxy` name (storage keys, env
  vars, headers, path aliases) — see the README's historical note.
