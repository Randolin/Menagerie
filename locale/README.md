# Translating Menagerie

Everything Menagerie says to a person is addressable. There are two
catalogues, because there are two mechanisms, and the split is not
cosmetic — it follows from where the words live.

| File                                  | What's in it                                          | Keyed by                         |
| ------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `locale/messages.json`                | the app's own copy — chrome, pages, buttons, alt text | Angular message ids (hashes)     |
| `libs/core/src/i18n/messages.en.json` | the survey itself — sections, questions, options      | the schema's own frozen item ids |

The survey lives in `libs/core`, which may not import a framework, so
Angular's extractor cannot see it. That is the whole reason for the second
file. Its keys (`it.ab.pn.o2`, `sec.about.title`) are built from item ids and
option indexes, both of which the schema freeze makes permanent — so a
translation survives every edit the schema is allowed to make, which is
relabelling and appending.

## Regenerating them

```sh
npm run i18n:extract     # both; run after changing any user-facing copy
```

`messages.spec.ts` fails when the domain catalogue drifts from the schema, so
CI will tell you if you forget that half.

## Adding a language

Write `public/i18n/<lang>.json` with either or both halves filled in:

```json
{
  "template": { "<angular message id>": "…" },
  "domain": { "it.ab.pn.label": "…", "sec.about.title": "…" }
}
```

Then open the app with `?lang=<lang>`, which also remembers the choice.
Anything you leave out shows the English it was written in — partial
translations are a supported state, not a broken one, and a language that
fails to load is never the reason someone can't open their profile.

`en` is the source language: no file, no fetch.

## Checking your work covers the screen

The e2e suite builds a pseudo-locale from `messages.json` — every string
wrapped in `«guillemets»` — and drives the UI with it. Anything still reading
as plain English on screen is copy nobody marked, which is the one i18n
mistake no compiler and no unit test can catch. Run `npm run e2e` and look at
the `01c-pseudo-locale` screenshot, or serve a build and open `?lang=qps`
after writing the same file yourself.
