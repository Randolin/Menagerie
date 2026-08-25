// Freeze guard for the secret-tail wordlists. These expansions are part of
// every minted credential: phrase validation is membership-based, so any
// reorder/removal/typo silently invalidates existing view phrases. The
// digests pin the exact expansion — fix regressions, never the digests
// (append-only growth requires a deliberate digest update in the same
// change, with a comment explaining the append).
//
// The digests below were updated once, for the 64 → 128 base growth. Updating
// a pinned digest deliberately removes the very defense the digest provides,
// so the growth also added the PREFIX freeze test: the first 2,048 entries of
// each list must still hash to the PRE-GROWTH digests. That is the mechanical
// proof the change was a pure append and not a reorder, and it keeps the old
// digests load-bearing forever. Any future append must extend that pattern —
// pin the new full digest, and keep every earlier prefix digest asserted.
import { describe, expect, test } from 'vitest';
import { TAIL_ADJECTIVES, TAIL_PLACES, TAIL_MORPHEMES } from './tail-wordlists';

async function digest16(words: readonly string[]): Promise<string> {
  const bytes = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(words.join(','))),
  );
  return [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('tail wordlists', () => {
  test('morpheme grids are exactly 128 × 32 on both sides', () => {
    expect(TAIL_MORPHEMES.ADJ_BASES).toHaveLength(128);
    expect(TAIL_MORPHEMES.ADJ_SUFFIXES).toHaveLength(32);
    expect(TAIL_MORPHEMES.PLACE_BASES).toHaveLength(128);
    expect(TAIL_MORPHEMES.PLACE_SUFFIXES).toHaveLength(32);
  });

  test('morphemes are unique within each grid', () => {
    for (const grid of Object.values(TAIL_MORPHEMES)) {
      expect(new Set(grid).size).toBe(grid.length);
    }
  });

  // Uniqueness is not free: base+suffix concatenation can collide across
  // different (base, suffix) pairs once bases are appended. Set size is the
  // only thing that catches it.
  test('expansions: 4,096 unique lowercase words each, lists disjoint', () => {
    expect(TAIL_ADJECTIVES).toHaveLength(4096);
    expect(TAIL_PLACES).toHaveLength(4096);
    expect(new Set(TAIL_ADJECTIVES).size).toBe(4096);
    expect(new Set(TAIL_PLACES).size).toBe(4096);
    for (const w of [...TAIL_ADJECTIVES, ...TAIL_PLACES]) expect(w).toMatch(/^[a-z]+$/);
    const places = new Set(TAIL_PLACES);
    expect(TAIL_ADJECTIVES.some((w) => places.has(w))).toBe(false);
  });

  test('tail entropy is exactly 36 bits (12 + 12 + 12)', () => {
    const bits = Math.log2(TAIL_ADJECTIVES.length ** 2 * TAIL_PLACES.length);
    expect(bits).toBe(36);
  });

  test('FROZEN expansion digests', async () => {
    // Updated for the 64 → 128 base append. Guarded by the prefix test below.
    expect(await digest16(TAIL_ADJECTIVES)).toBe('78f0ea2adfa8b442');
    expect(await digest16(TAIL_PLACES)).toBe('95e8282f8ab7bb99');
  });

  // The strongest guarantee in this file: whatever was appended, the words
  // that shipped first are still exactly where they were, in order.
  test('FROZEN prefix digests — the pre-growth 2,048 are untouched', async () => {
    expect(await digest16(TAIL_ADJECTIVES.slice(0, 2048))).toBe('ac8abf9cc566f8a7');
    expect(await digest16(TAIL_PLACES.slice(0, 2048))).toBe('9156f3f7784743d0');
  });
});
