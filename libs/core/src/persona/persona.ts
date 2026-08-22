// Profile personas. The creature IS the view phrase's first three words —
// adjA-adjB-animal, straight off the frozen wordlists — so identity needs no
// derivation at all. Only the accent color is derived, from a hash of the
// FULL phrase: it rotates with the secret tail and is visible only to
// phrase-holders.
//
// Recognizability is the point: the same phrase shows the same creature to
// everyone. Regenerating the view phrase is the unlink lever — new creature,
// and every previously shared link or QR stops working.
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';

export interface Persona {
  /** [adjectiveA, adjectiveB, animal] */
  readonly words: readonly [string, string, string];
  /** e.g. 'brave-amber-otter' */
  readonly name: string;
  readonly emoji: string;
  readonly color: string;
  readonly colorIndex: number;
}

/** Null when the first three words don't match the frozen lists. */
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
  // 16 divides 256 exactly — single-byte masking is uniform.
  const colorIndex = digest[0] & 15;
  return {
    words: [adjA, adjB, animal.name],
    name: `${adjA}-${adjB}-${animal.name}`,
    emoji: animal.emoji,
    color: PERSONA_COLORS[colorIndex],
    colorIndex,
  };
}
