// Profile personas. The creature IS the view phrase's first three words —
// adjA-adjB-animal, straight off the frozen wordlists — so identity needs no
// derivation at all. The accent color derives from the HEAD words only
// (v3): the chip is displayed in places the secret tail must never leak
// into, and a full-phrase-derived color was a 4-bit oracle that let anyone
// who'd seen the chip filter tail candidates. Head-only means the color is
// part of the stable creature identity and leaks nothing.
//
// Recognizability is the point: the same phrase shows the same creature to
// everyone. Regenerating the view phrase is the unlink lever — new creature,
// and every previously shared link or QR stops working.
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';
import { adjBHue } from './adjb-hues';

export interface Persona {
  /** [adjectiveA, adjectiveB, animal] */
  readonly words: readonly [string, string, string];
  /** e.g. 'brave-amber-otter' */
  readonly name: string;
  readonly emoji: string;
  readonly color: string;
  /** Second accent, straight from the adjB color-word (HEAD-only like color). */
  readonly color2: string;
  readonly colorIndex: number;
}

/** Null when the first three words don't match the frozen lists. */
export async function personaFromViewPhrase(viewPhrase: string): Promise<Persona | null> {
  const words = viewPhrase
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length < 3) return null;
  const [adjA, adjB, animalName] = words;
  const animal = ANIMALS.find((a) => a.name === animalName);
  if (!animal || !ADJECTIVES_A.includes(adjA) || !ADJECTIVES_B.includes(adjB)) return null;
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`moxy.persona.v3|${adjA}-${adjB}-${animal.name}`),
    ),
  );
  // 16 divides 256 exactly — single-byte masking is uniform.
  const colorIndex = digest[0] & 15;
  return {
    words: [adjA, adjB, animal.name],
    name: `${adjA}-${adjB}-${animal.name}`,
    emoji: animal.emoji,
    color: PERSONA_COLORS[colorIndex],
    // Membership was checked above, so the lookup can't miss.
    color2: adjBHue(adjB) ?? PERSONA_COLORS[colorIndex],
    colorIndex,
  };
}
