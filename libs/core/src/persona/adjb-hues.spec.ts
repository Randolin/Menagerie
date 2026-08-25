import { describe, expect, test } from 'vitest';
import { ADJ_B_HUES, adjBHue } from './adjb-hues';
import { ADJECTIVES_B } from './wordlists';
import { ANIMAL_HABITATS, HABITAT_META, habitatOf, type Habitat } from './habitat';
import { ANIMALS } from './wordlists';

// Same helper as persona.spec.ts — the shared bound is the contract.
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

describe('ADJ_B_HUES', () => {
  // Length-EQUALITY, not a magic number: this is the lockstep guard. A hue
  // table shorter than its word list silently hands `undefined` to the QR
  // gradient for every appended word, which fails as a blank second stop
  // rather than an exception. Asserting equality survives the next growth.
  test('stays index-aligned with ADJECTIVES_B, entries unique', () => {
    expect(ADJ_B_HUES).toHaveLength(ADJECTIVES_B.length);
    expect(new Set(ADJ_B_HUES).size).toBe(ADJ_B_HUES.length);
  });

  test('every hue keeps QR-safe contrast (relative luminance <= 0.20)', () => {
    for (let i = 0; i < ADJ_B_HUES.length; i++) {
      const hue = ADJ_B_HUES[i];
      expect(hue).toMatch(/^#[0-9a-f]{6}$/);
      expect(relativeLuminance(hue), `${ADJECTIVES_B[i]} ${hue}`).toBeLessThanOrEqual(0.2);
    }
  });

  test('lookup by word; unknown word is null', () => {
    expect(adjBHue(ADJECTIVES_B[0])).toBe(ADJ_B_HUES[0]);
    expect(adjBHue(ADJECTIVES_B[63])).toBe(ADJ_B_HUES[63]);
    const last = ADJECTIVES_B.length - 1;
    expect(adjBHue(ADJECTIVES_B[last])).toBe(ADJ_B_HUES[last]);
    expect(adjBHue('nope')).toBeNull();
  });
});

describe('ANIMAL_HABITATS', () => {
  const habitats: readonly Habitat[] = ['forest', 'water', 'sky', 'meadow', 'mythic'];

  test('covers every animal with a valid habitat; meta covers all habitats', () => {
    expect(ANIMAL_HABITATS).toHaveLength(ANIMALS.length);
    for (const h of ANIMAL_HABITATS) expect(habitats).toContain(h);
    for (const h of habitats) {
      expect(HABITAT_META[h].motif.length).toBeGreaterThan(0);
      expect(HABITAT_META[h].label.length).toBeGreaterThan(0);
    }
    // Every habitat is actually inhabited.
    expect(new Set(ANIMAL_HABITATS).size).toBe(habitats.length);
  });

  test('lookup by animal name; unknown name is null', () => {
    expect(habitatOf('fox')).toBe('forest');
    expect(habitatOf(ANIMALS[19].name)).toBe('water'); // octopus
    expect(habitatOf('unicorn')).toBe('mythic');
    expect(habitatOf('nope')).toBeNull();
  });
});
