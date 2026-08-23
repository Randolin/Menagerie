// Moxy domain types.
//
// Compatibility contract: answers are stored as option INDEXES keyed by item
// id, and shared links encode those indexes. To keep old links readable,
// options may be appended or relabeled, but never reordered or removed, and
// item ids never change meaning. Retired ids are never reused. Breaking
// changes bump PROFILE_VERSION and ship an upgrader in codec/migrate.ts.
// The append-only rule is enforced by schema.spec.ts against the checked-in
// schema-v2.freeze.json golden fixture.
//
// v2 (structured-only): free-text items were removed entirely — every answer
// is an option index, a set of indexes, or a slider position, so everything
// is comparable, plottable, and impossible to accidentally deanonymize with.

export const PROFILE_VERSION = 2;

export type ItemId = string;

/** 0 = Not for me · 1 = If you are · 2 = Curious · 3 = Into it */
export type InterestLevel = 0 | 1 | 2 | 3;

export interface InterestLevelDef {
  readonly value: InterestLevel;
  readonly label: string;
}

export const INTEREST_LEVELS: readonly InterestLevelDef[] = [
  { value: 0, label: 'Not for me' },
  { value: 1, label: 'If you are' },
  { value: 2, label: 'Curious' },
  { value: 3, label: 'Into it' },
];

/**
 * How much an item matters to its owner when scoring someone ELSE against
 * them. Absent = normal. 3 (dealbreaker) additionally carries the owner's
 * acceptable option/level indexes in the payload's `d` map and is only
 * meaningful for choice/multi/interest items; scales cap at 2.
 */
export type ImportanceWeight = 1 | 2 | 3;

export interface ImportanceWeightDef {
  readonly value: ImportanceWeight;
  readonly label: string;
}

export const IMPORTANCE_WEIGHTS: readonly ImportanceWeightDef[] = [
  { value: 1, label: 'Matters to me' },
  { value: 2, label: 'Matters a lot' },
  { value: 3, label: 'Dealbreaker' },
];

interface ItemBase {
  readonly id: ItemId;
  /**
   * 'core' items form the short first pass — the minimum for a meaningful
   * compare. Everything else is depth, delivered through packs.
   */
  readonly tier?: 'core';
}

/** Single select; `ordinal` means adjacent options are "close" for scoring. */
export interface ChoiceItem extends ItemBase {
  readonly type: 'choice';
  readonly label: string;
  readonly ordinal?: true;
  readonly options: readonly string[]; // APPEND-ONLY
}

/** Multi select, scored by overlap. */
export interface MultiItem extends ItemBase {
  readonly type: 'multi';
  readonly label: string;
  readonly options: readonly string[]; // APPEND-ONLY
}

/** 0..6 slider between two anchor phrases; scored by closeness. */
export interface ScaleItem extends ItemBase {
  readonly type: 'scale';
  readonly left: string;
  readonly right: string;
}

/** 0..3 interest level; matched by mutual positivity. */
export interface InterestItem extends ItemBase {
  readonly type: 'interest';
  readonly label: string;
}

export type Item = ChoiceItem | MultiItem | ScaleItem | InterestItem;
export type ItemType = Item['type'];

export type AnswerValue = number | readonly number[];
export type Answers = Record<ItemId, AnswerValue>;

/** Per-item importance set by the profile owner (absent = normal). */
export type Weights = Record<ItemId, ImportanceWeight>;
/** For dealbreaker items: the owner's acceptable option/level indexes. */
export type Acceptable = Record<ItemId, readonly number[]>;

export type SectionPrivacy = 'open' | 'match';

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly privacy: SectionPrivacy;
  readonly optIn?: true;
  readonly blurb: string;
  readonly items: readonly Item[];
}

/**
 * Historical v1 payload shape (free-text answers were strings). Kept only so
 * the v1→v2 migration and its spec have an honest type to talk about.
 */
export interface ProfilePayloadV1 {
  v: 1;
  a: Record<ItemId, number | readonly number[] | string>;
  s?: string;
  m?: string[];
}

/**
 * The shareable payload, format version 2 — the JSON inside a profile's
 * view blob. `a` carries open answers; `s` (salt) + `m` (match tokens)
 * carry the hashed, mutual-reveal-only desires; `w` (importance) + `d`
 * (acceptable sets for dealbreakers) carry the owner's weighting, present
 * only where set. All optional fields are omitted when empty.
 */
export interface ProfilePayloadV2 {
  v: 2;
  a: Record<ItemId, AnswerValue>;
  s?: string;
  m?: string[];
  w?: Weights;
  d?: Acceptable;
}

/** Widens to a union when a v3 payload lands; migrate.ts upgrades old shapes. */
export type ProfilePayload = ProfilePayloadV2;
