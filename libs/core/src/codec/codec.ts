// Share-payload construction. The payload is what a viewer decrypts: open
// answers plus the salted, mutual-reveal-only desire fingerprints, plus the
// owner's importance weighting. It never travels in a URL anymore — it lives
// on the server as ciphertext under the view key (see hatch/blob.ts);
// migrate.ts versions the JSON inside.
import type {
  Acceptable,
  Answers,
  ImportanceWeight,
  ProfilePayload,
  Weights,
} from '../schema/types';
import { PROFILE_VERSION } from '../schema/types';
import { openItems } from '../schema/schema';

/**
 * Build the shareable payload object from a full answer set. Match-only
 * (desires) answers are stripped here and represented solely by the
 * pre-computed `matchTokens` (see crypto/match-tokens.ts). Weights ride
 * along only for items that are actually answered, and are normalized
 * defensively: scales cap at 2 (a scale dealbreaker is not a thing), and a
 * dealbreaker without a usable acceptable set downgrades to "matters a lot".
 */
export function buildSharePayload(
  answers: Answers,
  matchTokens: readonly string[],
  salt: string | null,
  weights: Weights = {},
  acceptable: Acceptable = {},
): ProfilePayload {
  const open: Record<string, Answers[string]> = {};
  const w: Record<string, ImportanceWeight> = {};
  const d: Record<string, readonly number[]> = {};
  for (const { item } of openItems()) {
    const v = answers[item.id];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    open[item.id] = v;

    const rawWeight = weights[item.id];
    if (rawWeight !== 1 && rawWeight !== 2 && rawWeight !== 3) continue;
    let weight: ImportanceWeight = rawWeight;
    if (item.type === 'scale') {
      if (weight === 3) weight = 2;
    } else if (weight === 3) {
      const max = item.type === 'interest' ? 4 : item.options.length;
      const ok = (acceptable[item.id] ?? []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < max,
      );
      if (ok.length === 0 || ok.length === max) {
        weight = 2; // a dealbreaker excluding nothing (or everything) is noise
      } else {
        d[item.id] = ok;
      }
    }
    w[item.id] = weight;
  }
  const payload: ProfilePayload = { v: PROFILE_VERSION, a: open };
  if (matchTokens.length && salt) {
    payload.s = salt;
    payload.m = [...matchTokens];
  }
  if (Object.keys(w).length) payload.w = w;
  if (Object.keys(d).length) payload.d = d;
  return payload;
}
