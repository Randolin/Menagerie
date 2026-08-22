// Share-payload construction. The payload is what a viewer decrypts: open
// answers plus the salted, mutual-reveal-only desire fingerprints. It never
// travels in a URL anymore — it lives on the server as ciphertext under the
// view key (see hatch/blob.ts); migrate.ts versions the JSON inside.
import type { Answers, ProfilePayload } from '../schema/types';
import { PROFILE_VERSION } from '../schema/types';
import { openItems } from '../schema/schema';

/**
 * Build the shareable payload object from a full answer set. Match-only
 * (desires) answers are stripped here and represented solely by the
 * pre-computed `matchTokens` (see crypto/match-tokens.ts).
 */
export function buildSharePayload(
  answers: Answers,
  matchTokens: readonly string[],
  salt: string | null,
): ProfilePayload {
  const open: Record<string, Answers[string]> = {};
  for (const { item } of openItems()) {
    const v = answers[item.id];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    open[item.id] = v;
  }
  const payload: ProfilePayload = { v: PROFILE_VERSION, a: open };
  if (matchTokens.length && salt) {
    payload.s = salt;
    payload.m = [...matchTokens];
  }
  return payload;
}
