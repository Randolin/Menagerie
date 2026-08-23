// Freeze guard for the secret-tail wordlists. These expansions are part of
// every minted credential: phrase validation is membership-based, so any
// reorder/removal/typo silently invalidates existing view phrases. The
// digests pin the exact expansion — fix regressions, never the digests
// (append-only growth requires a deliberate digest update in the same
// change, with a comment explaining the append).
import { describe, expect, test } from 'vitest';
import { TAIL_ADJECTIVES, TAIL_PLACES, TAIL_MORPHEMES } from './tail-wordlists';

async function digest16(words: readonly string[]): Promise<string> {
  const bytes = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(words.join(','))),
  );
  return [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('tail wordlists', () => {
  test('morpheme grids are exactly 64 × 32 on both sides', () => {
    expect(TAIL_MORPHEMES.ADJ_BASES).toHaveLength(64);
    expect(TAIL_MORPHEMES.ADJ_SUFFIXES).toHaveLength(32);
    expect(TAIL_MORPHEMES.PLACE_BASES).toHaveLength(64);
    expect(TAIL_MORPHEMES.PLACE_SUFFIXES).toHaveLength(32);
  });

  test('expansions: 2,048 unique lowercase words each, lists disjoint', () => {
    expect(TAIL_ADJECTIVES).toHaveLength(2048);
    expect(TAIL_PLACES).toHaveLength(2048);
    expect(new Set(TAIL_ADJECTIVES).size).toBe(2048);
    expect(new Set(TAIL_PLACES).size).toBe(2048);
    for (const w of [...TAIL_ADJECTIVES, ...TAIL_PLACES]) expect(w).toMatch(/^[a-z]+$/);
    const places = new Set(TAIL_PLACES);
    expect(TAIL_ADJECTIVES.some((w) => places.has(w))).toBe(false);
  });

  test('tail entropy is exactly 33 bits (11 + 11 + 11)', () => {
    const bits = Math.log2(TAIL_ADJECTIVES.length ** 2 * TAIL_PLACES.length);
    expect(bits).toBe(33);
  });

  test('FROZEN expansion digests', async () => {
    expect(await digest16(TAIL_ADJECTIVES)).toBe('ac8abf9cc566f8a7');
    expect(await digest16(TAIL_PLACES)).toBe('9156f3f7784743d0');
  });
});
