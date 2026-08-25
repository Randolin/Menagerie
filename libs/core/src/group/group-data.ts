// Group content shapes (v1) — everything here travels only as ciphertext
// under the group read key.
//
// A member's deposit is tiered by what it reveals:
//   Tier 1 (joined): a SNAPSHOT of open answers + importance weights under a
//     random pseudonym. Full compare math works; no view link, no creature
//     identity, no reach-back. Hashed fingerprints were considered and
//     rejected as privacy theater — our answer space is small enough to
//     dictionary-recover, so the honest line is what a deposit omits.
//     Desires are NEVER in a deposit, in any form.
//   Tier 2 (open): adds the member's view phrase — live profile, creature
//     identity, and a way to reach back. A deliberate grant to everyone who
//     holds the group phrase, present and future; only a re-mint un-shares.
import type { Answers, ProfilePayload } from '../schema/types';
import { ADJECTIVES_A, ADJECTIVES_B } from '../persona/wordlists';
import { buildSharePayload } from '../codec/codec';
import { migrateToCurrent } from '../codec/migrate';
import { randomIndex } from '../crypto/random';
import type { Acceptable, Weights } from '../schema/types';

export interface GroupMeta {
  v: 1;
  createdAt: number;
}

export interface GroupDeposit {
  v: 1;
  /** Group-local identity: `adjA-adjB` from the public head lists. */
  pseudonym: string;
  emoji: string;
  tier: 1 | 2;
  /** Tier 1+2: open answers + weights, shaped exactly like a view payload
   *  (minus desire salt/tokens — never included). */
  snapshot: ProfilePayload;
  /** Tier 2 only. */
  viewPhrase?: string;
  depositedAt: number;
}

const PSEUDONYM_EMOJI = [
  '🐾',
  '🌿',
  '🌙',
  '⭐',
  '🍄',
  '🌊',
  '🪶',
  '🦋',
  '🐚',
  '🌸',
  '🍁',
  '⛰️',
  '🔥',
  '❄️',
  '🌈',
  '🫧',
] as const;

function tinyHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Random group-local pseudonym; its emoji is stable per pseudonym. */
export function mintPseudonym(): { pseudonym: string; emoji: string } {
  const pseudonym = `${ADJECTIVES_A[randomIndex(ADJECTIVES_A.length)]}-${
    ADJECTIVES_B[randomIndex(ADJECTIVES_B.length)]
  }`;
  return { pseudonym, emoji: pseudonymEmoji(pseudonym) };
}

export function pseudonymEmoji(pseudonym: string): string {
  return PSEUDONYM_EMOJI[tinyHash(pseudonym) % PSEUDONYM_EMOJI.length];
}

/**
 * Build a deposit from the member's current state. The snapshot rides
 * through buildSharePayload with no salt/tokens, so it contains exactly what
 * an open view payload would — desires structurally cannot enter.
 */
export function buildDeposit(
  tier: 1 | 2,
  answers: Answers,
  weights: Weights,
  acceptable: Acceptable,
  viewPhrase: string | undefined,
  pseudonym: { pseudonym: string; emoji: string },
  now: number,
): GroupDeposit {
  const snapshot = buildSharePayload(answers, [], null, weights, acceptable);
  return {
    v: 1,
    pseudonym: pseudonym.pseudonym,
    emoji: pseudonym.emoji,
    tier,
    snapshot,
    ...(tier === 2 && viewPhrase ? { viewPhrase } : {}),
    depositedAt: now,
  };
}

export function migrateDeposit(raw: unknown): GroupDeposit {
  if (raw === null || typeof raw !== 'object') throw new Error('Malformed deposit.');
  const d = raw as Partial<GroupDeposit> & { v?: number };
  if (d.v !== 1 || typeof d.pseudonym !== 'string' || (d.tier !== 1 && d.tier !== 2)) {
    throw new Error('Unknown deposit shape.');
  }
  return {
    v: 1,
    pseudonym: d.pseudonym,
    emoji: typeof d.emoji === 'string' ? d.emoji : pseudonymEmoji(d.pseudonym),
    tier: d.tier,
    snapshot: migrateToCurrent(d.snapshot),
    viewPhrase: typeof d.viewPhrase === 'string' ? d.viewPhrase : undefined,
    depositedAt: typeof d.depositedAt === 'number' ? d.depositedAt : 0,
  };
}

export function emptyGroupMeta(now: number): GroupMeta {
  return { v: 1, createdAt: now };
}

export function migrateGroupMeta(raw: unknown): GroupMeta {
  if (raw === null || typeof raw !== 'object') throw new Error('Malformed group meta.');
  const m = raw as Partial<GroupMeta> & { v?: number };
  if (m.v !== 1) throw new Error(`Unknown group-meta version (v${String(m.v)}).`);
  return { v: 1, createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0 };
}
