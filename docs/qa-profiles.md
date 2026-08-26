# The QA cast

A fixed set of profiles for exercising comparisons, groups and Boops against a
real server. Menagerie has no staging environment, so these are ordinary live
profiles — they just happen to be listed in a file.

The manifest is [`libs/core/src/qa/qa-profiles.ts`](../libs/core/src/qa/qa-profiles.ts);
the answers each member gives are generated from the schema by
[`qa-answers.ts`](../libs/core/src/qa/qa-answers.ts), so the cast keeps
covering new survey items as `sections.ts` grows.

## Seeding

```sh
npm run server                                          # or point at prod
npm run seed:qa -- --base-url=http://localhost:8787
```

Anything that isn't localhost needs `--yes`. `--dry-run` prints the plan
without touching the server, `--only=twin-a,twin-b` narrows the run.

Re-running is safe: a profile that already exists is left alone, a group is
only topped up to its roster size, and knocks are only sent to inboxes the
same run created (a Boop inbox accepts four knocks an hour). Every Argon2id
derivation costs seconds, so a full seed takes a couple of minutes; the script
backs off and retries when it outruns the server's per-IP write budget.

## What's in it

| id        | answers                    | what it's for                                                                                                               |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `twin-a`  | all, weighted              | The reference profile. Carries importance weights and one dealbreaker.                                                      |
| `twin-b`  | all, identical to `twin-a` | The compare ceiling — pairs at 1.000.                                                                                       |
| `mirror`  | all, inverted              | The compare floor (~0.25, not 0 — ordinal choices and multi-selects still partly agree) and the dealbreaker-violation path. |
| `sparse`  | core items only            | Thin overlap: half the coverage, and the "not enough answers yet" copy.                                                     |
| `minimal` | one                        | A near-empty profile. It can't be _fully_ empty — never-populated profiles are swept after 7 days.                          |
| `roamer`  | all, unrelated             | Middling scores, and the joiner/sender in group and Boop runs.                                                              |

Two groups: **den** (6 deposits, mixed tier 1 and 2 — over `MAX_COMPARE`, so
the compare picker has to cap) and **crowd** (32 deposits, `GROUP_MAX_MEMBERS`
— roster rendering and the join-when-full path). Most deposits are synthetic:
a deposit is a blob under the group key and needs no profile behind it.

Two Boops land in `twin-a`'s inbox, one plain and one attaching a view phrase,
each with a live reply box behind it.

## Credentials

The manifest holds **view phrases only** — read capabilities, public by
design. Edit phrases and group admin phrases are the write credentials; the
seed script mints them at run time, prints them once, and writes them to
`qa-seed.local.json` (gitignored). Put them in a password manager or treat the
cast as disposable and re-seed. Committing one would publish a live write
capability to a production profile, and a revert would not take it back out of
git history — `qa-profiles.spec.ts` fails the build if a passphrase-shaped
string ever appears in the manifest.

## Why not `-robot` animal words

Marking test profiles with a distinct creature word (`-robot`, `-droid`) looks
tidier and doesn't work:

- `mintViewPhrase` draws word 3 uniformly from `ANIMALS`, so an appended robot
  lands in real users' mint pool.
- The wordlists are frozen on arrival and `ANIMAL_HABITATS` must grow in
  lockstep; `ANIMALS.length` feeds the entropy ledger in `hatch/phrases.ts`.
- The server never sees a phrase — it stores client-derived locators and
  ciphertext — so a keyword could never let the backend exclude QA rows from
  metrics or GC anyway.

Membership in the manifest does the same job, touches no frozen contract, and
is deletable in one commit.
