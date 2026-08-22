import { describe, expect, test } from 'vitest';
import { derivePersona, mintPersonaSeed, personaFromPayload, PERSONA_SEED_RE } from './persona';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './wordlists';
import type { ProfilePayload } from '../schema/types';

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

describe('persona derivation', () => {
  // FROZEN fixtures: captured from the shipped derivation. If these fail,
  // the derivation or a wordlist index changed — every existing profile
  // would silently get a new creature. Fix the regression, not the values.
  test('frozen oracle', async () => {
    expect(await derivePersona('AAAAAAAA')).toEqual({
      seed: 'AAAAAAAA',
      words: ['fierce', 'starry', 'dolphin'],
      name: 'fierce-starry-dolphin',
      emoji: '🐬',
      color: '#1d3557',
      colorIndex: 14,
    });
    const second = await derivePersona('moxy_tst');
    expect(second.name).toBe('lively-cheerful-deer');
    expect(second.emoji).toBe('🦌');
    expect(second.color).toBe('#1c5cab');
  });

  test('deterministic and seed-sensitive', async () => {
    const a1 = await derivePersona('AbCd12_-');
    const a2 = await derivePersona('AbCd12_-');
    expect(a1).toEqual(a2);
    const b = await derivePersona('AbCd12_x');
    expect(b.name).not.toBe(a1.name);
  });

  test('minted seeds are 8 base64url chars and non-repeating', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const seed = mintPersonaSeed();
      expect(seed).toMatch(PERSONA_SEED_RE);
      seen.add(seed);
    }
    expect(seen.size).toBe(50);
  });

  test('personaFromPayload: valid seed derives, absent/invalid yields null', async () => {
    const base: ProfilePayload = { v: 1, a: {} };
    expect(await personaFromPayload(base)).toBeNull();
    expect(await personaFromPayload({ ...base, e: 'short' })).toBeNull();
    expect(await personaFromPayload({ ...base, e: 'bad!seed' })).toBeNull();
    const p = await personaFromPayload({ ...base, e: 'AAAAAAAA' });
    expect(p?.name).toBe('fierce-starry-dolphin');
  });
});
