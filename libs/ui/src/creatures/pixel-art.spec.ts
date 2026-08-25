import { describe, expect, test } from 'vitest';
import { ANIMALS } from '@moxy/core';
import { CREATURE_SPRITES } from './pixel-grids';
import { creaturePixelSvg, creatureSpriteRects, spriteRects, spriteSvg } from './pixel-art';

describe('CREATURE_SPRITES', () => {
  // Coverage FLOOR, not full coverage. ANIMALS grew 64 → 108; the 44 appended
  // creatures have no hand-drawn sprite yet and fall back to the platform
  // emoji, which pixel-grids.ts documents as always-safe. Requiring a sprite
  // per animal would have blocked the wordlist growth on ~44 pieces of art.
  //
  // The floor still ratchets: it must never drop below the sprites that exist
  // today, so this cannot silently regress into "no sprites at all". Raise it
  // as art lands, and restore strict per-animal coverage once it all does.
  const SPRITE_FLOOR = 64;

  test('sprite coverage stays at or above the floor', () => {
    const covered = ANIMALS.filter((a) => CREATURE_SPRITES[a.name]).length;
    expect(covered).toBeGreaterThanOrEqual(SPRITE_FLOOR);
  });

  test('every sprite is a real animal', () => {
    for (const key of Object.keys(CREATURE_SPRITES)) {
      expect(
        ANIMALS.some((a) => a.name === key),
        key,
      ).toBe(true);
    }
  });

  test('every grid is 16 rows of 16 known letters', () => {
    for (const [name, sprite] of Object.entries(CREATURE_SPRITES)) {
      expect(sprite.rows, name).toHaveLength(16);
      for (const row of sprite.rows) {
        expect(row.length, `${name}: "${row}"`).toBe(16);
        for (const letter of row) {
          if (letter === '.') continue;
          expect(sprite.palette[letter], `${name}: letter '${letter}'`).toBeDefined();
        }
      }
    }
  });

  test('palette entries are hex colors', () => {
    for (const [name, sprite] of Object.entries(CREATURE_SPRITES)) {
      for (const hex of Object.values(sprite.palette)) {
        expect(hex, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('pixel renderer', () => {
  test('merges horizontal runs into single rects', () => {
    const rects = spriteRects({ palette: { x: '#111111' }, rows: ['xx', '.x'] });
    expect(rects).toBe(
      '<rect x="0" y="0" width="2" height="1" fill="#111111"/>' +
        '<rect x="1" y="1" width="1" height="1" fill="#111111"/>',
    );
  });

  test('standalone svg carries size and crisp edges', () => {
    const svg = spriteSvg(CREATURE_SPRITES['fox'], 32);
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('width="32"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  test('lookups fall back to null for unknown animals', () => {
    expect(creaturePixelSvg('fox')).toContain('<svg');
    expect(creaturePixelSvg('gryphon')).toBeNull();
    expect(creatureSpriteRects('fox')).toContain('<rect');
    expect(creatureSpriteRects('gryphon')).toBeNull();
  });
});
