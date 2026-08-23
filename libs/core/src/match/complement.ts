// Complementarity — the dimensions where a good match means interlocking,
// not matching. A give/receive pair scores directionally: how much of what
// one person needs the other naturally provides. Registered pairs are
// excluded from plain similarity in directional fits (scores.ts) so they
// are never double-counted.
import type { ProfilePayload } from '../schema/types';

export interface ComplementPair {
  /** Multi item: what the owner gives. */
  readonly give: string;
  /** Multi item: what the owner needs to receive. Options must align 1:1. */
  readonly receive: string;
  readonly label: string;
}

export const COMPLEMENT_PAIRS: readonly ComplementPair[] = [
  { give: 'cn.give', receive: 'cn.receive', label: 'Care given ↔ care received' },
];

/**
 * How well `giver` covers `receiver`'s needs for one pair: the fraction of
 * the receiver's receive-options present in the giver's give-options.
 * Null when either side hasn't answered.
 */
export function interlockScore(
  giver: ProfilePayload,
  receiver: ProfilePayload,
  pair: ComplementPair,
): number | null {
  const gives = giver.a[pair.give];
  const needs = receiver.a[pair.receive];
  if (!Array.isArray(gives) || !Array.isArray(needs) || needs.length === 0) {
    return null;
  }
  const given = new Set(gives);
  return needs.filter((i) => given.has(i)).length / needs.length;
}
