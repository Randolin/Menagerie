// Minting must reach the WHOLE of every list, uniformly.
//
// The old pick64 masked a random byte with `length - 1`. At 64 that was exact;
// at 108 it would be silently wrong — `& 107` clears bits, so a large block of
// animals could never be minted at all while the lists and specs all still
// looked correct. A size assertion cannot catch that. Sampling can: if any
// appended word is unreachable, coverage collapses and this fails.
import { describe, expect, test } from 'vitest';
import { mintViewPhrase, isViewPhraseShaped } from './phrases';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';

const SAMPLES = 20_000;

describe('mintViewPhrase distribution', () => {
  // Minting is sync work behind an async signature; gather once, share across
  // the tests below so 20k mints happen a single time.
  const collected: Promise<string[]> = (async () => {
    const out: string[] = [];
    for (let i = 0; i < SAMPLES; i++) out.push(await mintViewPhrase());
    return out;
  })();

  test('every minted phrase is well-formed', async () => {
    const phrases = await collected;
    for (const p of phrases.slice(0, 500)) expect(isViewPhraseShaped(p), p).toBe(true);
  });

  test('reaches every entry of all three head lists', async () => {
    const phrases = await collected;
    const seenA = new Set<string>();
    const seenB = new Set<string>();
    const seenAnimal = new Set<string>();
    for (const p of phrases) {
      const w = p.split('-');
      seenA.add(w[0]);
      seenB.add(w[1]);
      seenAnimal.add(w[2]);
    }
    // With 20k samples the chance of missing any of ≤128 entries is negligible
    // unless it is structurally unreachable — which is exactly the bug.
    expect(seenA.size, 'ADJECTIVES_A coverage').toBe(ADJECTIVES_A.length);
    expect(seenB.size, 'ADJECTIVES_B coverage').toBe(ADJECTIVES_B.length);
    expect(seenAnimal.size, 'ANIMALS coverage').toBe(ANIMALS.length);
  });

  // Coverage alone would pass a merely lopsided generator; this catches skew.
  test('head slots are near-uniform (chi-square within bounds)', async () => {
    const phrases = await collected;
    const check = (slot: number, size: number, label: string) => {
      const counts = new Map<string, number>();
      for (const p of phrases) {
        const word = p.split('-')[slot];
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
      const expected = SAMPLES / size;
      let chi = 0;
      for (const word of counts.keys()) {
        const diff = (counts.get(word) ?? 0) - expected;
        chi += (diff * diff) / expected;
      }
      // Generous bound: ~3x the df, far above normal fluctuation but far below
      // what any masking or modulo-bias artefact would produce.
      expect(chi, `${label} chi-square ${chi.toFixed(1)}`).toBeLessThan(size * 3);
    };
    check(0, ADJECTIVES_A.length, 'ADJECTIVES_A');
    check(1, ADJECTIVES_B.length, 'ADJECTIVES_B');
    check(2, ANIMALS.length, 'ANIMALS');
  });

  test('tail slots reach deep into the 4,096-entry lists', async () => {
    const phrases = await collected;
    const places = new Set(phrases.map((p) => p.split('-')[5]));
    // 20k draws from 4,096 should surface a large fraction of the space.
    expect(places.size).toBeGreaterThan(3000);
  });
});
