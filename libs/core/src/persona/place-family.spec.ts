// Guard for the ONE tail-derived projection that reaches the screen.
//
// These are leak tests, not behaviour tests: each one pins a property that,
// if it broke, would publish more of the secret tail than the bit ledger in
// hatch/phrases.ts accounts for. Treat a failure here as a security
// regression, not a styling nit.
import { describe, expect, test } from 'vitest';
import {
  PLACE_FAMILIES,
  PLACE_FAMILY_META,
  PLACE_SUFFIX_FAMILIES,
  placeFamilyOf,
} from './place-family';
import { TAIL_MORPHEMES, TAIL_PLACES } from './tail-wordlists';

describe('suffix → family map', () => {
  test('covers every suffix exactly once, in lockstep', () => {
    expect(PLACE_SUFFIX_FAMILIES).toHaveLength(TAIL_MORPHEMES.PLACE_SUFFIXES.length);
    for (const f of PLACE_SUFFIX_FAMILIES) expect(PLACE_FAMILIES).toContain(f);
  });

  test('every declared family is actually used, and has meta', () => {
    const used = new Set(PLACE_SUFFIX_FAMILIES);
    for (const f of PLACE_FAMILIES) {
      expect(used, `${f} is declared but unreachable`).toContain(f);
      expect(PLACE_FAMILY_META[f].label.length).toBeGreaterThan(0);
      expect(PLACE_FAMILY_META[f].motif.length).toBeGreaterThan(0);
      expect(PLACE_FAMILY_META[f].tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  // ~3.55 bits is an AVERAGE over a near-uniform partition. A family holding
  // a single suffix would be a 1-in-32 outcome that, when it lands, narrows
  // the place word far more than the ledger claims. Bounding the spread bounds
  // the worst case, not just the mean.
  test('families stay balanced — no rare, highly-informative family', () => {
    const counts = new Map<string, number>();
    for (const f of PLACE_SUFFIX_FAMILIES) counts.set(f, (counts.get(f) ?? 0) + 1);
    for (const [family, n] of counts) {
      expect(n, `${family} holds ${n} suffixes`).toBeGreaterThanOrEqual(2);
      expect(n, `${family} holds ${n} suffixes`).toBeLessThanOrEqual(4);
    }
  });

  test('published entropy stays within the ledger (<= 3.6 bits)', () => {
    const counts = new Map<string, number>();
    for (const f of PLACE_SUFFIX_FAMILIES) counts.set(f, (counts.get(f) ?? 0) + 1);
    const total = PLACE_SUFFIX_FAMILIES.length;
    let bits = 0;
    for (const n of counts.values()) {
      const p = n / total;
      bits -= p * Math.log2(p);
    }
    expect(bits).toBeLessThanOrEqual(3.6);
  });
});

describe('placeFamilyOf', () => {
  test('resolves every real place word', () => {
    for (const word of TAIL_PLACES) expect(placeFamilyOf(word), word).not.toBeNull();
  });

  // The security property: the base contributes nothing. If this fails, the
  // banner has begun distinguishing bases and the leak is ~7 bits, not ~3.55.
  test('all 128 bases of a given suffix share one family', () => {
    const { PLACE_BASES, PLACE_SUFFIXES } = TAIL_MORPHEMES;
    for (let s = 0; s < PLACE_SUFFIXES.length; s++) {
      const families = new Set(PLACE_BASES.map((_, b) => placeFamilyOf(TAIL_PLACES[b * 32 + s])));
      expect(families.size, `suffix "${PLACE_SUFFIXES[s]}" spans ${families.size} families`).toBe(1);
    }
  });

  test('a base spans many families — the base is not readable off the banner', () => {
    const families = new Set(TAIL_PLACES.slice(0, 32).map((w) => placeFamilyOf(w)));
    expect(families.size).toBeGreaterThan(1);
  });

  test('is not string matching — a non-list word never resolves', () => {
    // Shaped exactly like a real place word, and not in the list.
    expect(placeFamilyOf('zzzzhollow')).toBeNull();
    expect(placeFamilyOf('hollow')).toBeNull();
    expect(placeFamilyOf('fern')).toBeNull();
    expect(placeFamilyOf('')).toBeNull();
    expect(placeFamilyOf(null)).toBeNull();
    expect(placeFamilyOf(undefined)).toBeNull();
  });

  // Labels are the easiest place to accidentally publish the actual word.
  test('no family label contains a base or suffix from the lists', () => {
    const morphemes = [...TAIL_MORPHEMES.PLACE_BASES, ...TAIL_MORPHEMES.PLACE_SUFFIXES];
    for (const family of PLACE_FAMILIES) {
      const label = PLACE_FAMILY_META[family].label.toLowerCase();
      for (const m of morphemes) {
        expect(
          new RegExp(`\\b${m}\\b`).test(label),
          `label "${label}" names the morpheme "${m}"`,
        ).toBe(false);
      }
    }
  });
});
