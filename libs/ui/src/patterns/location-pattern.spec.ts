// Pattern generation: every family draws, drawing is reproducible, and the
// geometry carries no more of the tail than the family name already does.
import { describe, expect, test } from 'vitest';
import { PLACE_FAMILIES, bannerStyleFor, personaFromViewPhrase, tailPlaceOf } from '@mng/core';
import { locationPattern, PATTERN_HEIGHT, PATTERN_WIDTH } from './location-pattern';
import { mulberry32 } from './rng';

describe('locationPattern', () => {
  test('every family produces shapes — no blank banners', () => {
    for (const family of PLACE_FAMILIES) {
      const shapes = locationPattern(family, 12345, 1, 2);
      expect(shapes.length, family).toBeGreaterThan(0);
      for (const s of shapes) {
        expect(s.d, family).toMatch(/^M/);
        expect(s.opacity).toBeGreaterThan(0);
        expect(s.opacity).toBeLessThanOrEqual(1);
        expect(Number.isFinite(s.stroke)).toBe(true);
      }
    }
  });

  test('no NaN ever reaches path data', () => {
    for (const family of PLACE_FAMILIES) {
      for (let scale = 0; scale < 4; scale++) {
        for (let density = 0; density < 4; density++) {
          for (const shape of locationPattern(family, 999 * scale + density, scale, density)) {
            expect(shape.d, `${family} s${scale} d${density}`).not.toMatch(
              /NaN|Infinity|undefined/,
            );
          }
        }
      }
    }
  });

  // Reproducibility is what makes the banner recognisably *yours* rather than
  // decoration that reshuffles on every reload.
  test('same inputs draw the same banner', () => {
    for (const family of PLACE_FAMILIES) {
      expect(locationPattern(family, 42, 2, 1)).toEqual(locationPattern(family, 42, 2, 1));
    }
  });

  test('different head seeds draw different geometry', () => {
    const a = locationPattern('highland', 1, 2, 2);
    const b = locationPattern('highland', 2, 2, 2);
    expect(a).not.toEqual(b);
  });
});

describe('the pattern publishes nothing beyond the family', () => {
  const head = 'amber-azure-fox';

  async function styleFor(place: string, adj = 'mistlit-moonworn') {
    const phrase = `${head}-${adj}-${place}`;
    return bannerStyleFor(await personaFromViewPhrase(phrase), tailPlaceOf(phrase));
  }

  // Same family, different base and different tail adjectives: the drawing must
  // be byte-identical. If geometry ever varied here, a screenshot would
  // fingerprint the place word even with the palette held constant.
  test('geometry is identical across bases and tail adjectives in one family', async () => {
    const a = await styleFor('fernhollow');
    const b = await styleFor('stonehollow');
    const c = await styleFor('fernglen', 'wolfsworn-ravenetched');
    expect(a?.family).toBe('lowland');
    expect(b?.family).toBe('lowland');
    expect(c?.family).toBe('lowland');
    const draw = (s: NonNullable<typeof a>) =>
      locationPattern(s.family, s.seed, s.scale, s.density);
    expect(draw(b!)).toEqual(draw(a!));
    expect(draw(c!)).toEqual(draw(a!));
  });

  test('the seed itself never moves with the tail', async () => {
    const a = await styleFor('fernhollow');
    const b = await styleFor('fernshore');
    expect(a?.seed).toBe(b?.seed);
    expect(a?.scale).toBe(b?.scale);
    expect(a?.family).not.toBe(b?.family);
  });
});

describe('mulberry32', () => {
  test('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('pattern viewport', () => {
  test('is a sane banner aspect', () => {
    expect(PATTERN_WIDTH).toBeGreaterThan(PATTERN_HEIGHT);
  });
});
