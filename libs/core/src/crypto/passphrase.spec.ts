import { describe, expect, it } from 'vitest';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';
import { TAIL_ADJECTIVES, TAIL_PLACES } from '../persona/tail-wordlists';
import { generatePassphrase, isOneWord } from './passphrase';
import { normalizePassphrase } from './phrase-kdf';

/**
 * The invariant every mintable list has to hold: a word must survive
 * normalization as one word.
 *
 * `normalizePassphrase` splits on hyphens as well as spaces — it has to, so a
 * view phrase normalizes identically whether it was written with hyphens or
 * spaces — which means a hyphenated entry is two words by the time anything
 * counts them. A minted phrase built from one is the right phrase with the
 * wrong length, and the length guards in front of the KDF turn that into a
 * profile that cannot be opened. The EFF list has four such entries and the
 * bug shipped; this is the tripwire for the next one.
 *
 * These lists are append-only, so the check is on additions: if you add a word
 * with a hyphen or a space, this fails and the phrase minting is what has to
 * change, never `normalizePassphrase`.
 */
describe('mintable words survive normalization', () => {
  const LISTS: readonly (readonly [string, readonly string[]])[] = [
    ['ADJECTIVES_A', ADJECTIVES_A],
    ['ADJECTIVES_B', ADJECTIVES_B],
    ['ANIMALS', ANIMALS.map((a) => a.name)],
    ['TAIL_ADJECTIVES', TAIL_ADJECTIVES],
    ['TAIL_PLACES', TAIL_PLACES],
  ];

  for (const [name, list] of LISTS) {
    it(`holds for ${name}`, () => {
      expect(list.filter((word) => !isOneWord(word))).toEqual([]);
    });
  }

  it('holds for every word an edit phrase can be minted from', async () => {
    // Not the raw EFF list — that one legitimately contains hyphenated words
    // and stays exactly as vendored. This is what minting is allowed to pick.
    for (let i = 0; i < 400; i++) {
      const phrase = await generatePassphrase(5);
      expect(normalizePassphrase(phrase).split(' '), phrase).toHaveLength(5);
    }
  });

  it('still excludes the four the EFF list actually has', async () => {
    // Naming them pins the fix to the thing it fixes: if a future filter
    // change lets these back in, the failure says which words and why.
    const { WORDS } = await import('./eff-wordlist');
    expect(WORDS.filter((word) => !isOneWord(word))).toEqual([
      'drop-down',
      'felt-tip',
      't-shirt',
      'yo-yo',
    ]);
  });
});
