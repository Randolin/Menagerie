// Moxy domain types.
//
// Compatibility contract: answers are stored as option INDEXES keyed by item
// id, and shared links encode those indexes. To keep old links readable,
// options may be appended or relabeled, but never reordered or removed, and
// item ids never change meaning. Breaking changes bump PROFILE_VERSION.
// The append-only rule is enforced by schema.spec.ts against the checked-in
// schema-v1.freeze.json golden fixture.

export const PROFILE_VERSION = 1;

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

interface ItemBase {
  readonly id: ItemId;
}

/** Free text, display only, never scored. */
export interface TextItem extends ItemBase {
  readonly type: 'text';
  readonly label: string;
  readonly hint?: string;
  readonly short?: true;
  readonly suggest?: readonly string[];
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

export type Item = TextItem | ChoiceItem | MultiItem | ScaleItem | InterestItem;
export type ItemType = Item['type'];

export type AnswerValue = string | number | readonly number[];
export type Answers = Record<ItemId, AnswerValue>;

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
 * The shareable payload, format version 1 — the JSON inside a profile's
 * view blob. `a` carries open answers; `s` (salt) + `m` (match tokens)
 * carry the hashed, mutual-reveal-only desires — present only when desires
 * were answered positively.
 */
export interface ProfilePayloadV1 {
  v: 1;
  a: Record<ItemId, AnswerValue>;
  s?: string;
  m?: string[];
}

/** Widens to a union when a v2 payload lands; migrate.ts upgrades old shapes. */
export type ProfilePayload = ProfilePayloadV1;
