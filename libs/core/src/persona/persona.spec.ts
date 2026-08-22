import { describe, expect, test } from 'vitest';
import { personaFromViewPhrase } from './persona';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

describe('persona wordlists', () => {
  test('sizes are exactly the frozen index spaces, entries unique', () => {
    expect(ADJECTIVES_A).toHaveLength(64);
    expect(ADJECTIVES_B).toHaveLength(64);
    expect(ANIMALS).toHaveLength(64);
    expect(PERSONA_COLORS).toHaveLength(16);
    expect(new Set(ADJECTIVES_A).size).toBe(64);
    expect(new Set(ADJECTIVES_B).size).toBe(64);
    expect(new Set(ANIMALS.map((a) => a.name)).size).toBe(64);
    expect(new Set(PERSONA_COLORS).size).toBe(16);
  });

  test('every color keeps QR-safe contrast (relative luminance <= 0.20)', () => {
    for (const color of PERSONA_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(relativeLuminance(color), color).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('personaFromViewPhrase', () => {
  // The frozen color/emoji oracle for the reference phrase lives in
  // hatch.spec.ts next to the KDF vectors; here: shape and determinism.
  test('identity is the literal head words; deterministic', async () => {
    const phrase = `${ADJECTIVES_A[0]}-${ADJECTIVES_B[0]}-${ANIMALS[0].name}-tail-words-here`;
    const a = await personaFromViewPhrase(phrase);
    const b = await personaFromViewPhrase(phrase);
    expect(a).toEqual(b);
    expect(a?.name).toBe(`${ADJECTIVES_A[0]}-${ADJECTIVES_B[0]}-${ANIMALS[0].name}`);
    expect(a?.emoji).toBe(ANIMALS[0].emoji);
    expect(PERSONA_COLORS).toContain(a?.color);
  });

  test('spaces and case normalize like phrases do', async () => {
    const spaced = await personaFromViewPhrase(
      ` ${ADJECTIVES_A[1].toUpperCase()} ${ADJECTIVES_B[1]} ${ANIMALS[1].name} x y z `,
    );
    expect(spaced?.name).toBe(`${ADJECTIVES_A[1]}-${ADJECTIVES_B[1]}-${ANIMALS[1].name}`);
  });

  test('non-list words yield null', async () => {
    expect(await personaFromViewPhrase('nope-nope-nope-a-b-c')).toBeNull();
    expect(await personaFromViewPhrase('too-short')).toBeNull();
  });
});
