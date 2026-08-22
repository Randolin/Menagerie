// Phrase minting and recognition.
//
// View phrase (6 words, fixed grammar): adjA-adjB-animal + three random EFF
// words. The first three words ARE the profile's creature name by
// construction (18 bits, public by design — anyone who sees the persona chip
// learns them), so the secret budget is the 3-word tail (~39 bits). At the
// 300k-iteration KDF that prices a persona-aware targeted attack at roughly
// a GPU-year — a deliberate curtain, documented in-app. Edit phrase: 5 EFF
// words (~65 bits) — the strong credential.
import { normalizePassphrase } from '../crypto/vault-crypto';
import { generatePassphrase } from '../crypto/passphrase';
import { randomBytes } from '../crypto/random';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';

export const VIEW_PHRASE_WORDS = 6;
export const EDIT_PHRASE_WORDS = 5;

function pick64(list: readonly unknown[]): number {
  // 64 divides 256 exactly — single-byte masking is uniform.
  return randomBytes(1)[0] & (list.length - 1);
}

export async function mintViewPhrase(): Promise<string> {
  const head = [
    ADJECTIVES_A[pick64(ADJECTIVES_A)],
    ADJECTIVES_B[pick64(ADJECTIVES_B)],
    ANIMALS[pick64(ANIMALS)].name,
  ];
  const tail = await generatePassphrase(3);
  return [...head, ...tail.split(' ')].join('-');
}

export async function mintEditPhrase(): Promise<string> {
  return generatePassphrase(EDIT_PHRASE_WORDS);
}

/** The canonical hyphenated form used for display, URLs, and derivation. */
export function canonicalViewPhrase(text: string): string {
  return normalizePassphrase(text).split(' ').join('-');
}

/**
 * Grammar check: word 1 ∈ adjectives-A, word 2 ∈ adjectives-B, word 3 ∈
 * animals, then exactly three more words. Gives instant client-side
 * validation and makes view phrases visually distinct from edit phrases.
 */
export function isViewPhraseShaped(text: string): boolean {
  const words = canonicalViewPhrase(text).split('-');
  if (words.length !== VIEW_PHRASE_WORDS) return false;
  return (
    ADJECTIVES_A.includes(words[0]) &&
    ADJECTIVES_B.includes(words[1]) &&
    ANIMALS.some((a) => a.name === words[2]) &&
    words.slice(3).every((w) => /^[a-z]+$/.test(w))
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
