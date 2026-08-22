// Match tokens for the desires section.
//
// Honest threat model (also documented in the About page): match tokens are
// salted hashes of (item, interest level). The compare UI only reveals an
// item when BOTH profiles carry a positive token for it. Because the answer
// space is small, a motivated person with your link could dictionary-test
// the hashes — so treat "match-only" as a polite curtain, not cryptographic
// secrecy. "Not for me" answers are never encoded in any form, so they are
// genuinely unknowable. The per-profile random salt prevents two different
// shares from being linked to the same person by comparing token sets.
import type { Answers, InterestLevel, ProfilePayload } from '../schema/types';
import { matchItems } from '../schema/schema';
import { bytesToB64url } from '../codec/base64url';
import { randomBytes } from './random';

const subtle = globalThis.crypto.subtle;

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

const TOKEN_CHARS = 16; // 96 bits of the hash, base64url

export async function matchToken(salt: string, itemId: string, level: number): Promise<string> {
  const h = await sha256(`moxy.mt.v1|${salt}|${itemId}|${level}`);
  return bytesToB64url(h).slice(0, TOKEN_CHARS);
}

/**
 * Build the token set for a profile's match-only answers. Only positive
 * levels (>= 1) produce tokens; the set is padded with random decoys to the
 * next multiple of 8 and shuffled, so the token count doesn't reveal how
 * many desires were marked.
 */
export async function buildMatchTokens(answers: Answers, salt: string): Promise<string[]> {
  const tokens: string[] = [];
  for (const { item } of matchItems()) {
    const level = answers[item.id];
    if (typeof level === 'number' && level >= 1 && level <= 3) {
      tokens.push(await matchToken(salt, item.id, level));
    }
  }
  if (tokens.length === 0) return [];
  const padTo = Math.ceil((tokens.length + 1) / 8) * 8;
  while (tokens.length < padTo) {
    tokens.push(bytesToB64url(randomBytes(12)).slice(0, TOKEN_CHARS));
  }
  // Fisher–Yates with crypto randomness.
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = randomBytes(4).reduce((a, b) => (a << 8) | b, 0) >>> 0;
    const k = j % (i + 1);
    [tokens[i], tokens[k]] = [tokens[k], tokens[i]];
  }
  return tokens;
}

/**
 * Given another profile's payload (salt + token set), find which of THEIR
 * desire levels are discoverable for a specific item. Returns 0 if none.
 */
export async function probeLevel(payload: ProfilePayload, itemId: string): Promise<InterestLevel> {
  if (!payload.m || !payload.s) return 0;
  const set = new Set(payload.m);
  for (let level = 3; level >= 1; level--) {
    if (set.has(await matchToken(payload.s, itemId, level))) return level as InterestLevel;
  }
  return 0;
}
