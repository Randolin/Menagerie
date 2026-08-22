// Profile personas: a deterministic pet name + creature + color derived from
// a small random seed carried in the share payload.
//
// The persona is STABLE PER PROFILE by explicit user choice: the same seed
// travels in every share link the profile mints, which makes separately
// shared links correlatable to the same profile — a deliberate softening of
// the per-share unlinkability property, documented in-app. Regenerating the
// seed unlinks the profile from all previously shared links.
import type { ProfilePayload } from '../schema/types';
import { bytesToB64url } from '../codec/base64url';
import { randomBytes } from '../crypto/random';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';

/** Reserved key in the Answers map — same convention as '_optin.<section>'. */
export const PERSONA_SEED_KEY = '_persona';
export const PERSONA_SEED_RE = /^[A-Za-z0-9_-]{8}$/;

export interface Persona {
  readonly seed: string;
  /** [adjectiveA, adjectiveB, animal] */
  readonly words: readonly [string, string, string];
  /** e.g. 'brave-amber-otter' */
  readonly name: string;
  readonly emoji: string;
  readonly color: string;
  readonly colorIndex: number;
}

/** 6 random bytes → exactly 8 base64url chars (48 bits). */
export function mintPersonaSeed(): string {
  return bytesToB64url(randomBytes(6));
}

/**
 * Deterministic derivation. Indexing is exactly uniform: 256 = 4·64 = 16·16,
 * so single-byte masking has no modulo bias.
 */
export async function derivePersona(seed: string): Promise<Persona> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`moxy.persona.v1|${seed}`),
    ),
  );
  const adjA = ADJECTIVES_A[digest[0] & 63];
  const adjB = ADJECTIVES_B[digest[1] & 63];
  const animal = ANIMALS[digest[2] & 63];
  const colorIndex = digest[3] & 15;
  return {
    seed,
    words: [adjA, adjB, animal.name],
    name: `${adjA}-${adjB}-${animal.name}`,
    emoji: animal.emoji,
    color: PERSONA_COLORS[colorIndex],
    colorIndex,
  };
}

/** Null when the payload carries no (valid) persona seed — e.g. old links. */
export async function personaFromPayload(payload: ProfilePayload): Promise<Persona | null> {
  const seed = payload.e;
  if (typeof seed !== 'string' || !PERSONA_SEED_RE.test(seed)) return null;
  return derivePersona(seed);
}

/**
 * Persona v2 (hatch model): the creature IS the view phrase's first three
 * words, verbatim — no hashing needed for identity. Only the accent color is
 * derived, from a hash of the FULL phrase, so it rotates with the secret
 * tail and is visible only to phrase-holders. Null when the words don't
 * match the frozen lists.
 */
export async function personaFromViewPhrase(viewPhrase: string): Promise<Persona | null> {
  const words = viewPhrase.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (words.length < 3) return null;
  const [adjA, adjB, animalName] = words;
  const animal = ANIMALS.find((a) => a.name === animalName);
  if (!animal || !ADJECTIVES_A.includes(adjA) || !ADJECTIVES_B.includes(adjB)) return null;
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`moxy.persona.v2|${words.join('-')}`),
    ),
  );
  const colorIndex = digest[0] & 15;
  return {
    seed: '',
    words: [adjA, adjB, animal.name],
    name: `${adjA}-${adjB}-${animal.name}`,
    emoji: animal.emoji,
    color: PERSONA_COLORS[colorIndex],
    colorIndex,
  };
}
