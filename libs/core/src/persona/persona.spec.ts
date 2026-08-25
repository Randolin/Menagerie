import { describe, expect, test } from 'vitest';
import { personaFromViewPhrase } from './persona';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';
import { ADJ_B_HUES } from './adjb-hues';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

describe('persona wordlists', () => {
  test('sizes are the grown index spaces, entries unique', () => {
    expect(ADJECTIVES_A).toHaveLength(128);
    expect(ADJECTIVES_B).toHaveLength(128);
    // 108, not 128: the supply of single-codepoint animal emoji runs out. See
    // the note on ANIMALS — the list stops where the good entries stop.
    expect(ANIMALS).toHaveLength(108);
    expect(PERSONA_COLORS).toHaveLength(16);
    expect(new Set(ADJECTIVES_A).size).toBe(ADJECTIVES_A.length);
    expect(new Set(ADJECTIVES_B).size).toBe(ADJECTIVES_B.length);
    expect(new Set(ANIMALS.map((a) => a.name)).size).toBe(ANIMALS.length);
    expect(new Set(PERSONA_COLORS).size).toBe(16);
  });

  // Was only a comment on ADJECTIVES_B ("no brave-brave") until the lists
  // grew; with 128 entries a curation slip is far too easy to eyeball.
  test('adjective lists are disjoint — no "brave-brave" creature', () => {
    const b = new Set(ADJECTIVES_B);
    expect(ADJECTIVES_A.filter((w) => b.has(w))).toEqual([]);
  });

  test('every word is lowercase a-z', () => {
    for (const w of [...ADJECTIVES_A, ...ADJECTIVES_B, ...ANIMALS.map((a) => a.name)]) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });

  // The emoji rule was prose on the ANIMALS declaration and nothing enforced
  // it. Two distinct failure modes: a VS16 sequence (renders inconsistently
  // and breaks single-glyph layout), and a bare default-text-presentation
  // codepoint such as U+1F54A DOVE, which is one codepoint but renders as a
  // monochrome text glyph. Both are rejected by requiring exactly one
  // codepoint AND no variation selector.
  test('every animal emoji is a single codepoint with no VS16', () => {
    for (const { name, emoji } of ANIMALS) {
      expect([...emoji], `${name} ${emoji}`).toHaveLength(1);
      expect(emoji.includes('\uFE0F'), `${name} carries VS16`).toBe(false);
    }
    expect(new Set(ANIMALS.map((a) => a.emoji)).size).toBe(ANIMALS.length);
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
    // color2 is the adjB word's own hue — index-aligned, HEAD-only.
    expect(a?.color2).toBe(ADJ_B_HUES[0]);
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
