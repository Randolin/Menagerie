// Retired schema ids — policy, not survey data; sections.ts stays pure data.
/**
 * Ids (items and sections) that once existed and were removed in schema v2.
 * They are NEVER reused — the freeze spec enforces this — and the v1→v2
 * payload migration drops or remaps their answers:
 *   ab.name / ab.intro / nt.*  → dropped (free text is gone; the creature is
 *                                the name, weighting replaced must-haves)
 *   ab.pronouns (text)         → mapped to ab.pn (multi) where possible
 *   cn.affection               → copied to cn.give (identical options)
 */
export const RETIRED_ITEM_IDS: readonly string[] = [
  'ab.name',
  'ab.pronouns',
  'ab.intro',
  'cn.affection',
  'nt.musthave',
  'nt.dealbreak',
  'nt.joy',
];

export const RETIRED_SECTION_IDS: readonly string[] = ['notes'];
