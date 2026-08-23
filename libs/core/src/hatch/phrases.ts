// Phrase minting and recognition.
//
// View phrase (6 words, fixed grammar): adjA-adjB-animal + a poetic secret
// tail of adjC-adjD-place from the 2,048-entry compound lists —
// `animated-pink-dartfrog-mistwoven-emberlit-fernhollow`. The first three
// words ARE the profile's creature name by construction (18 bits, public by
// design — anyone who sees the persona chip learns them), so the secret
// budget is the tail: exactly 33 bits, priced by the memory-hard Argon2id
// KDF — a deliberate curtain, documented in-app. The tail is handled as a
// secret: never displayed, never themed. Edit phrase: 5 EFF words
// (~65 bits) — the strong credential.
import { normalizePassphrase } from '../crypto/phrase-kdf';
import { generatePassphrase } from '../crypto/passphrase';
import { randomBytes, randomIndex } from '../crypto/random';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';
import { TAIL_ADJECTIVES, TAIL_PLACES } from '../persona/tail-wordlists';

export const VIEW_PHRASE_WORDS = 6;
export const EDIT_PHRASE_WORDS = 5;

function pick64(list: readonly unknown[]): number {
  // 64 divides 256 exactly — single-byte masking is uniform.
  return randomBytes(1)[0] & (list.length - 1);
}

export async function mintViewPhrase(): Promise<string> {
  return [
    ADJECTIVES_A[pick64(ADJECTIVES_A)],
    ADJECTIVES_B[pick64(ADJECTIVES_B)],
    ANIMALS[pick64(ANIMALS)].name,
    TAIL_ADJECTIVES[randomIndex(TAIL_ADJECTIVES.length)],
    TAIL_ADJECTIVES[randomIndex(TAIL_ADJECTIVES.length)],
    TAIL_PLACES[randomIndex(TAIL_PLACES.length)],
  ].join('-');
}

export async function mintEditPhrase(): Promise<string> {
  return generatePassphrase(EDIT_PHRASE_WORDS);
}

/** The canonical hyphenated form used for display, URLs, and derivation. */
export function canonicalViewPhrase(text: string): string {
  return normalizePassphrase(text).split(' ').join('-');
}

const TAIL_ADJ_SET = new Set<string>(TAIL_ADJECTIVES);
const TAIL_PLACE_SET = new Set<string>(TAIL_PLACES);

/**
 * Grammar check: word 1 ∈ adjectives-A, word 2 ∈ adjectives-B, word 3 ∈
 * animals, words 4–5 ∈ tail adjectives, word 6 ∈ tail places. Gives instant
 * client-side validation and makes view phrases visually distinct from edit
 * phrases.
 */
export function isViewPhraseShaped(text: string): boolean {
  const words = canonicalViewPhrase(text).split('-');
  if (words.length !== VIEW_PHRASE_WORDS) return false;
  return (
    ADJECTIVES_A.includes(words[0]) &&
    ADJECTIVES_B.includes(words[1]) &&
    ANIMALS.some((a) => a.name === words[2]) &&
    TAIL_ADJ_SET.has(words[3]) &&
    TAIL_ADJ_SET.has(words[4]) &&
    TAIL_PLACE_SET.has(words[5])
  );
}

/**
 * Accepts a bare phrase (spaces or hyphens) or a full view URL
 * (…#/view/<phrase>); returns the canonical phrase, or null.
 */
export function extractViewPhrase(text: string): string | null {
  let candidate = text.trim();
  const urlMatch = candidate.match(/#\/view\/([A-Za-z-]+)/);
  if (urlMatch) candidate = urlMatch[1];
  const canonical = canonicalViewPhrase(candidate);
  return isViewPhraseShaped(canonical) ? canonical : null;
}

export function viewUrlFor(viewPhrase: string, baseUrl?: string): string {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#/view/${canonicalViewPhrase(viewPhrase)}`;
}

/**
 * Group phrases share the view-phrase grammar (the group gets a creature
 * too); only the URL path differs. Accepts a bare phrase or …#/group/<phrase>.
 */
export function extractGroupPhrase(text: string): string | null {
  let candidate = text.trim();
  const urlMatch = candidate.match(/#\/group\/([A-Za-z-]+)/);
  if (urlMatch) candidate = urlMatch[1];
  const canonical = canonicalViewPhrase(candidate);
  return isViewPhraseShaped(canonical) ? canonical : null;
}

export function groupUrlFor(groupPhrase: string, baseUrl?: string): string {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#/group/${canonicalViewPhrase(groupPhrase)}`;
}
