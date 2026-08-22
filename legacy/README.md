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

## How it works

- **The link is the database.** Your answers are compressed (deflate) and
  encoded into the URL *fragment* (`#p=…`). Browsers never send fragments over
  the network, so not even the host serving these files sees a profile. The QR
  code is the same link, drawn as squares.
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
  the design. Share links and the passphrase are unrelated credentials: a
  link grants read access to what you chose to share, never edit access.
- **Compare 2–4 profiles.** Value alignment on dot strips, a mutual-interest
  matrix of connection types, per-section alignment meters, pairwise affinity
  for groups, a full side-by-side answer grid, and mutual-desire reveals.

## Running it

It's a static site with no build step and no dependencies to install:

```sh
# any static file server works, e.g.:
python3 -m http.server -d . 8000
# then open http://localhost:8000
```

Deploy by copying the files to any static host (GitHub Pages, Netlify, a
`$5 VPS`, an intranet share). Because profiles live in links, a profile made
on one Moxy deployment opens on any other.

> Note: ES modules require http(s) — opening `index.html` via `file://` won't
> work in most browsers; use any local server as above.

## Development

- `js/schema.js` — the survey definition (sections, items, option lists).
  Options are append-only and item ids are stable, so old links keep working.
- `js/codec.js` — payload encode/decode (`m1.` + base64url deflate).
- `js/crypto.js` — match-token hashing, vault key derivation, passphrases.
- `js/match.js` — similarity scoring and mutual-reveal logic.
- `js/vault.js` — draft autosave + encrypted vault storage.
- `js/views/*` — the pages; `js/charts.js` the hand-rolled chart components.

Run the tests (Node 18+):

```sh
node --test tests/core.test.mjs
```

## License

MIT. Vendored: [qrcode-generator](https://www.npmjs.com/package/qrcode-generator)
(MIT, Kazuhiko Arase); EFF large wordlist (CC-BY 3.0).
