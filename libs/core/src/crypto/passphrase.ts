import { normalizePassphrase } from './phrase-kdf';
import { randomIndex } from './random';

/**
 * The words that survive being normalized, memoized on first use.
 *
 * Four of the EFF list's 7,776 entries are hyphenated — `drop-down`,
 * `felt-tip`, `t-shirt`, `yo-yo` — and `normalizePassphrase` splits on
 * hyphens as well as spaces, because a view phrase is written with hyphens
 * and has to normalize to the same words either way. So a five-word phrase
 * containing one of them measures as SIX words the moment anything counts.
 *
 * That is not cosmetic. The phrase still derives correctly — mint and login
 * normalize identically, so the KDF never notices — but every length guard
 * standing in front of the KDF rejects it, and those guards `return` before
 * the derivation is attempted. The result is a profile whose own edit phrase
 * is refused at the door: a lockout with the data sitting right there,
 * roughly one profile in 390.
 *
 * The fix belongs here rather than in the guards, and certainly not in
 * `normalizePassphrase`, whose behaviour is a frozen KDF input — changing how
 * it splits would change every derivation ever made. Minting from the words
 * that survive it costs log2(7776/7772) × 5 ≈ 0.004 bits across a five-word
 * phrase, against ~64.6 bits total.
 *
 * The list itself is append-only and stays exactly as vendored; this filters
 * at selection time. `passphrase.spec.ts` fails if a future addition to any
 * mintable list would split.
 */
let pool: readonly string[] | null = null;

async function selectable(): Promise<readonly string[]> {
  if (!pool) {
    const { WORDS } = await import('./eff-wordlist');
    pool = WORDS.filter(isOneWord);
  }
  return pool;
}

/** True when normalization leaves the word intact — see `selectable`. */
export function isOneWord(word: string): boolean {
  return normalizePassphrase(word).split(' ').filter(Boolean).length === 1;
}

/**
 * Generate a diceware passphrase. The 7776-word EFF list is imported lazily
 * so its ~78 KB only loads as a separate chunk on the vault screens.
 */
export async function generatePassphrase(words = 5): Promise<string> {
  const list = await selectable();
  return Array.from({ length: words }, () => list[randomIndex(list.length)]).join(' ');
}
