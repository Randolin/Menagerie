// Phrase minting and recognition.
//
// View phrase (6 words, fixed grammar): adjA-adjB-animal + a poetic secret
// tail of adjC-adjD-place from the 4,096-entry compound lists —
// `animated-pink-dartfrog-mistwoven-emberlit-fernhollow`. The first three
// words ARE the profile's creature name by construction (~20.8 bits, public
// by design — anyone who sees the persona chip learns them), so the secret
// budget is the tail: exactly 36 bits, priced by the memory-hard Argon2id
// KDF — a deliberate curtain, documented in-app. Edit phrase: 5 EFF words
// (~65 bits) — the strong credential.
//
// BIT LEDGER (why the tail may now tint a banner at all):
//   head   log2(128 · 128 · 146)  = 21.19 bits, public by design
//          (ANIMALS grows by name now that emoji ran out — the head widens
//           with it, which only ever helps: the head is public either way
//           and the secret budget below is untouched.)
//   tail   log2(4096 · 4096 · 4096) = 36 bits, secret
//   published: the place word's landform FAMILY, 1 of 12 — 3.55 bits
//   effective secret = 36 − 3.55 = 32.45 bits, versus 33.00 before the growth
// So widening the tail lists pays for the banner almost exactly, and the
// banner buys memorability — a tail nobody can hold is a curtain in name only.
// Recompute this ledger before deriving anything else from the tail.
//
// TAIL SECRECY (revised): the tail words are never *displayed* and never
// derived into anything a phrase-less viewer can see. Only the landform family
// above is published, and only to viewers who already hold the phrase. Never a
// base, never an adjective, never the suffix itself. All within-family visual
// variation derives from the PUBLIC head words. See persona/place-family.ts.
import { normalizePassphrase } from '../crypto/phrase-kdf';
import { generatePassphrase } from '../crypto/passphrase';
import { randomIndex } from '../crypto/random';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';
import { TAIL_ADJECTIVES, TAIL_PLACES } from '../persona/tail-wordlists';

export const VIEW_PHRASE_WORDS = 6;
export const EDIT_PHRASE_WORDS = 5;

export async function mintViewPhrase(): Promise<string> {
  // Every slot uses randomIndex (rejection-sampled, uniform for ANY length).
  // The old pick64 masked with `length - 1`, which is only correct for a
  // power-of-two list — true at 64, still true for the 128-entry adjective
  // lists, but wrong the moment ANIMALS became 108. Masking is gone for good
  // so list sizes are free to be whatever curation honestly supports.
  return [
    ADJECTIVES_A[randomIndex(ADJECTIVES_A.length)],
    ADJECTIVES_B[randomIndex(ADJECTIVES_B.length)],
    ANIMALS[randomIndex(ANIMALS.length)].name,
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

/**
 * Word 6 (the place) of a well-formed view phrase, else null — the only
 * supported way to reach a tail word, and the sole input the location banner
 * takes from the tail. Gated on isViewPhraseShaped so a malformed or partial
 * phrase yields null rather than a stray substring that might resolve to a
 * family by accident.
 */
export function tailPlaceOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const canonical = canonicalViewPhrase(text);
  if (!isViewPhraseShaped(canonical)) return null;
  return canonical.split('-')[5];
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

function extractPhrase(text: string, path: 'view' | 'group'): string | null {
  let candidate = text.trim();
  const urlMatch = candidate.match(new RegExp(`#/${path}/([A-Za-z-]+)`));
  if (urlMatch) candidate = urlMatch[1];
  const canonical = canonicalViewPhrase(candidate);
  return isViewPhraseShaped(canonical) ? canonical : null;
}

function phraseUrlFor(phrase: string, path: 'view' | 'group', baseUrl?: string): string {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#/${path}/${canonicalViewPhrase(phrase)}`;
}

/**
 * Accepts a bare phrase (spaces or hyphens) or a full view URL
 * (…#/view/<phrase>); returns the canonical phrase, or null.
 */
export function extractViewPhrase(text: string): string | null {
  return extractPhrase(text, 'view');
}

export function viewUrlFor(viewPhrase: string, baseUrl?: string): string {
  return phraseUrlFor(viewPhrase, 'view', baseUrl);
}

/**
 * Group phrases share the view-phrase grammar (the group gets a creature
 * too); only the URL path differs. Accepts a bare phrase or …#/group/<phrase>.
 */
export function extractGroupPhrase(text: string): string | null {
  return extractPhrase(text, 'group');
}

export function groupUrlFor(groupPhrase: string, baseUrl?: string): string {
  return phraseUrlFor(groupPhrase, 'group', baseUrl);
}
