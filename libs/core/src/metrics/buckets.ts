// Bucket construction for the opt-in anonymous counters.
//
// Everything is joint-counted against the age band ("<ageIdx>|<itemId>|<v>")
// with a per-item denominator ("<ageIdx>|<itemId>|_n"), because "how do
// creatures in my age band answer X" is the whole product question. The
// curated list below is the ONLY data that ever leaves a device for
// metrics; identity-adjacent items (gender, orientation, pronouns) are
// deliberately absent.
//
// Desires are the sensitive tail, so each desire bit rides RANDOMIZED
// RESPONSE: report the truth with p = 0.75, the flipped bit with p = 0.25.
// Any individual submission is deniable — even to the operator — while the
// aggregate debiases as rate = (observed − 0.25) / 0.5.
import { SECTIONS } from '../schema/sections';
import { randomBytes } from '../crypto/random';
import type { Answers } from '../schema/types';

/** Open items whose (coarsened) answers may enter the counters. */
export const METRICS_ITEMS: readonly string[] = [
  // seeking: interest level coarsened to positive (>= "If you are") or not
  ...SECTIONS.find((s) => s.id === 'seeking')!.items.map((i) => i.id),
  // values: scales coarsened to lo (0-1) / mid (2-4) / hi (5-6)
  ...SECTIONS.find((s) => s.id === 'values')!.items.map((i) => i.id),
  // lifestyle + plans: single-choice items, raw option index
  'ls.alcohol',
  'ls.smoke',
  'ls.cannabis',
  'ls.diet',
  'ls.exercise',
  'ls.kids',
  'ls.sleep',
  'ls.tidy',
  'ls.setting',
  'ls.travel',
  'pl.move',
  'pl.money',
  'pl.cohabit',
  // structure: relationship shapes, one bucket per selected option
  'st.ideal',
  // desires: positive/not, randomized-response noised
  ...SECTIONS.find((s) => s.id === 'desires')!.items.map((i) => i.id),
];

/** True with probability 3/4 (crypto randomness). */
function keepTruth(): boolean {
  return randomBytes(1)[0] >= 64;
}

/**
 * The full coarse vector for one submission. Returns [] when the age band
 * is unanswered — age is the spine every joint count hangs off.
 */
export function buildMetricsBuckets(answers: Answers): string[] {
  const age = answers['ab.age'];
  if (typeof age !== 'number') return [];
  const buckets: string[] = [`age|${age}`];
  const joint = (itemId: string, value: string | number) =>
    buckets.push(`${age}|${itemId}|${value}`);

  for (const id of METRICS_ITEMS) {
    const v = answers[id];
    if (v === undefined || v === null) continue;
    if (id.startsWith('sk.') && typeof v === 'number') {
      joint(id, v >= 1 ? 1 : 0);
    } else if (id.startsWith('va.') && typeof v === 'number') {
      joint(id, v <= 1 ? 'lo' : v <= 4 ? 'mid' : 'hi');
    } else if (id === 'st.ideal' && Array.isArray(v)) {
      if (v.length === 0) continue;
      for (const opt of v) joint(id, opt);
    } else if (id.startsWith('dp.') && typeof v === 'number') {
      const truth = v >= 1;
      joint(id, (keepTruth() ? truth : !truth) ? 1 : 0);
    } else if (typeof v === 'number') {
      joint(id, v); // lifestyle/plans single choices
    } else {
      continue;
    }
    joint(id, '_n');
  }
  return buckets;
}

/** Undo the randomized-response bias on a desire's observed positive rate. */
export function debiasDesireRate(positive: number, total: number): number | null {
  if (total <= 0) return null;
  const observed = positive / total;
  return Math.max(0, Math.min(1, (observed - 0.25) / 0.5));
}
