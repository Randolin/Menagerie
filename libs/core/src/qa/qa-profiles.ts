// The QA cast: a manifest of fixed view phrases that `scripts/seed-qa.ts`
// hatches so comparisons, groups and boops can be exercised against a live
// server without hand-building state every time.
//
// WHY A MANIFEST AND NOT A KEYWORD. The obvious idea — mark test profiles
// with `-robot`/`-droid` animal words — does not survive contact with the
// design: `mintViewPhrase` draws word 3 uniformly from ANIMALS, so any
// appended robot lands in REAL users' mint pool; the wordlists are frozen on
// arrival and ANIMAL_HABITATS must grow in lockstep; and the server never
// sees a phrase at all (it stores client-derived locators and ciphertext),
// so a keyword could never let the backend exclude QA rows from metrics or
// GC. Membership in this list is the identifier instead — a Set lookup that
// touches no frozen contract and is deletable in one commit.
//
// VIEW PHRASES ONLY, NEVER EDIT PHRASES. A view phrase is a read capability
// and is public by design (the persona chip already leaks its head words).
// An edit phrase is the 65-bit write credential: committing one would hand
// every reader of this repository the power to rewrite or delete a live
// profile, and a revert would not take it back out of git history. The seed
// script mints edit phrases at run time and prints them once — put them in a
// password manager, or treat the cast as disposable and re-seed.
//
// These are ordinary profiles on the real server. They are subject to the
// same GC as everyone else's (hatch/constants.ts): never-populated profiles
// are swept after GC_EMPTY_HUMAN, which is why no member of the cast is left
// blank — see the 'minimal' mode.
import { canonicalViewPhrase, isViewPhraseShaped } from '../hatch/phrases';

/**
 * How a cast member answers. The mode plus the seed fully determine the
 * answer set (see qa-answers.ts), so two members sharing both are twins and
 * a 'mirror' is the exact inversion of the 'full' set with the same seed.
 */
export type QaAnswerMode =
  /** Every item answered, plus importance weights and one dealbreaker. */
  | 'full'
  /** Every item answered as the opposite of 'full' at the same seed. */
  | 'mirror'
  /** Only the `tier: 'core'` items — partial coverage. */
  | 'core-only'
  /** Exactly one answer: populated enough to survive GC, empty to look at. */
  | 'minimal';

export interface QaProfileSpec {
  /** Stable slug — how the script, the docs, and you refer to this one. */
  readonly id: string;
  /** Fixed so the profile keeps its creature and its links across re-seeds. */
  readonly viewPhrase: string;
  readonly mode: QaAnswerMode;
  readonly seed: number;
  /** What this member exists to exercise. */
  readonly note: string;
}

/**
 * Six profiles, chosen for the score boundaries rather than for volume: a
 * matched pair, its inversion, a partial, a near-empty, and a spare body for
 * groups and boops.
 */
export const QA_PROFILES: readonly QaProfileSpec[] = [
  {
    id: 'twin-a',
    viewPhrase: 'sage-bistre-chicken-yarrowtempered-feathertempered-laurellanding',
    mode: 'full',
    seed: 1,
    note: 'Reference profile: every item answered, importance weights and one dealbreaker set.',
  },
  {
    id: 'twin-b',
    viewPhrase: 'silver-clay-bactrian-fjordveiled-winterwarmed-birchrest',
    mode: 'full',
    seed: 1,
    note: 'Same answers as twin-a — the compare ceiling.',
  },
  {
    id: 'mirror',
    viewPhrase: 'nomadic-mustard-leopard-drifthaunted-autumnbound-rowanhaven',
    mode: 'mirror',
    seed: 1,
    note: 'Exact inversion of twin-a — the compare floor, and the dealbreaker-violation path.',
  },
  {
    id: 'sparse',
    viewPhrase: 'elegant-onyx-sauropod-frosttouched-lichenveiled-chestnutshore',
    mode: 'core-only',
    seed: 2,
    note: 'Core items only — thin overlap, and the "not enough answers yet" copy.',
  },
  {
    id: 'minimal',
    viewPhrase: 'prudent-spruce-ladybug-raincarved-snowmantled-birchshore',
    mode: 'minimal',
    seed: 3,
    note: 'One answer. A truly blank profile cannot live here — GC sweeps never-populated rows.',
  },
  {
    id: 'roamer',
    viewPhrase: 'endless-mango-dodo-nighttouched-candleforged-rosekeep',
    mode: 'full',
    seed: 4,
    note: 'Unrelated third party: middling scores, and the sender/joiner in boop and group runs.',
  },
];

export interface QaGroupMemberSpec {
  /** A QA_PROFILES id. */
  readonly profile: string;
  readonly tier: 1 | 2;
}

export interface QaGroupSpec {
  readonly id: string;
  readonly groupPhrase: string;
  /** Cast members who deposit for real, from their own profile state. */
  readonly members: readonly QaGroupMemberSpec[];
  /**
   * Extra synthetic tier-1 deposits, to reach a roster size worth testing.
   * A deposit is just a blob under the group key — it needs no profile and
   * no Argon2 pass, so crowding a roster is nearly free.
   */
  readonly fill: number;
  readonly note: string;
}

export const QA_GROUPS: readonly QaGroupSpec[] = [
  {
    id: 'den',
    groupPhrase: 'gilded-ivory-ox-flintcharmed-springspun-rosekeep',
    members: [
      { profile: 'twin-a', tier: 2 },
      { profile: 'sparse', tier: 1 },
      { profile: 'roamer', tier: 2 },
    ],
    fill: 3,
    note: 'Mixed tiers, 6 deposits — over MAX_COMPARE (4), so the compare picker must cap.',
  },
  {
    id: 'crowd',
    groupPhrase: 'courtly-cobalt-skunk-windmantled-pearlmarked-reedheath',
    members: [{ profile: 'roamer', tier: 1 }],
    fill: 31,
    note: 'A full roster at GROUP_MAX_MEMBERS (32) — roster rendering and the join-when-full path.',
  },
];

export interface QaBoopSpec {
  /** QA_PROFILES ids. */
  readonly from: string;
  readonly to: string;
  /** Indexes into BOOP_INTENTS. */
  readonly intents: readonly number[];
  readonly attachViewPhrase: boolean;
  readonly note: string;
}

export const QA_BOOPS: readonly QaBoopSpec[] = [
  {
    from: 'roamer',
    to: 'twin-a',
    intents: [0, 5],
    attachViewPhrase: false,
    note: 'A plain knock waiting in twin-a’s inbox, with a live reply box behind it.',
  },
  {
    from: 'mirror',
    to: 'twin-a',
    intents: [1],
    attachViewPhrase: true,
    note: 'A second knock, this one attaching a view phrase — the escalated first contact.',
  },
];

const BY_PHRASE = new Map(QA_PROFILES.map((p) => [p.viewPhrase, p]));

/** The cast member owning this view phrase (in any spacing/case), else null. */
export function qaProfile(viewPhrase: string | null | undefined): QaProfileSpec | null {
  if (!viewPhrase) return null;
  return BY_PHRASE.get(canonicalViewPhrase(viewPhrase)) ?? null;
}

export function isQaViewPhrase(viewPhrase: string | null | undefined): boolean {
  return qaProfile(viewPhrase) !== null;
}

/** True for a group phrase in the manifest — same membership test, groups. */
export function isQaGroupPhrase(groupPhrase: string | null | undefined): boolean {
  if (!groupPhrase) return false;
  const canonical = canonicalViewPhrase(groupPhrase);
  return QA_GROUPS.some((g) => g.groupPhrase === canonical);
}

/** Throws with the offending id — the seed script's fail-fast entry check. */
export function assertQaManifest(): void {
  const ids = new Set<string>();
  for (const spec of QA_PROFILES) {
    if (ids.has(spec.id)) throw new Error(`Duplicate QA profile id: ${spec.id}`);
    ids.add(spec.id);
    if (!isViewPhraseShaped(spec.viewPhrase)) {
      throw new Error(`QA profile ${spec.id} has a malformed view phrase.`);
    }
  }
  for (const group of QA_GROUPS) {
    if (!isViewPhraseShaped(group.groupPhrase)) {
      throw new Error(`QA group ${group.id} has a malformed group phrase.`);
    }
    for (const member of group.members) {
      if (!ids.has(member.profile)) {
        throw new Error(`QA group ${group.id} names unknown profile ${member.profile}.`);
      }
    }
  }
  for (const boop of QA_BOOPS) {
    for (const end of [boop.from, boop.to]) {
      if (!ids.has(end)) throw new Error(`QA boop names unknown profile ${end}.`);
    }
  }
}
