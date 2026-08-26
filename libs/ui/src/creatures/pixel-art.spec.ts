import { describe, expect, test } from 'vitest';
import { ANIMALS } from '@moxy/core';
import { CREATURE_SPRITES } from './pixel-grids';
import { creaturePixelSvg, creatureSpriteRects, spriteRects, spriteSvg } from './pixel-art';

describe('CREATURE_SPRITES', () => {
  // Strict per-animal coverage. This was a FLOOR of 64 while the 44 animals
  // appended in the 64 → 108 growth fell back to the platform emoji; that
  // backlog is now drawn, so the floor is gone and a new animal ships with a
  // sprite or fails here.
  //
  // The emoji fallback in creature-icon stays — it is what non-animal marks
  // (🥚, group pseudonyms) and anything arriving over the wire still need —
  // but it is no longer load-bearing for our own list.
  test('every animal has a sprite', () => {
    const missing = ANIMALS.filter((a) => !CREATURE_SPRITES[a.name]).map((a) => a.name);
    expect(missing).toEqual([]);
  });

  test('no sprite exists for an animal that is not in the list', () => {
    const names = new Set(ANIMALS.map((a) => a.name));
    expect(Object.keys(CREATURE_SPRITES).filter((k) => !names.has(k))).toEqual([]);
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

  // The letter vocabulary is shared on purpose: it is what lets one sprite's
  // grid be read, and edited, by anyone who has read another's. A batch that
  // invents its own letter breaks that, and the grids are too terse to
  // survive a private code.
  const LETTERS = {
    o: 'outline',
    a: 'primary fill',
    b: 'secondary — muzzle, belly, cheek patch',
    c: 'accent — comb, crest, fin',
    m: 'marking — stripes and spots',
    p: 'pink — nose, inner ear, tongue',
    y: 'beak, horn, tusk, talon',
    k: 'ink — pupils',
    w: 'white — eye whites and highlights',
  };

  test('palettes use only the shared letter vocabulary', () => {
    for (const [name, sprite] of Object.entries(CREATURE_SPRITES)) {
      for (const letter of Object.keys(sprite.palette)) {
        expect(Object.keys(LETTERS), `${name}: letter '${letter}'`).toContain(letter);
      }
    }
  });

  test('every creature is outlined', () => {
    for (const [name, sprite] of Object.entries(CREATURE_SPRITES)) {
      expect(sprite.rows.join('').includes('o'), name).toBe(true);
    }
  });

  // Eyes are what make a grid read as a creature rather than an object, so
  // the absence of them is a deliberate act that has to be named here.
  // Two kinds of exception, both deliberate. `nautilus` is a shell drawn as a
  // shell. The rest are the elementals: carved or bodiless things whose eyes
  // are LIT (the `y` iris) rather than looking — a pupil would give stone and
  // smoke an interiority the design is deliberately withholding. Anything
  // else reaching this list is a mistake, not a style.
  const EYELESS = new Set(['nautilus', 'golem', 'titan', 'djinn', 'sylph']);
  test('every creature has eyes, or is listed as deliberately eyeless', () => {
    for (const [name, sprite] of Object.entries(CREATURE_SPRITES)) {
      if (EYELESS.has(name)) continue;
      expect(sprite.rows.join('').includes('k'), `${name} has no pupils`).toBe(true);
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
