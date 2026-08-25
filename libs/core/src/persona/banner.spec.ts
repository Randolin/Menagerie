// The head/tail separation, asserted in both directions. See banner.ts.
import { describe, expect, test } from 'vitest';
import { bannerStyleFor } from './banner';
import { personaFromViewPhrase } from './persona';
import { tailPlaceOf } from '../hatch/phrases';

const HEAD = 'amber-azure-fox';
const OTHER_HEAD = 'brave-crimson-otter';
const TAIL_ADJ = 'mistlit-moonworn';

async function styleFor(head: string, place: string, adj = TAIL_ADJ) {
  const phrase = `${head}-${adj}-${place}`;
  return bannerStyleFor(await personaFromViewPhrase(phrase), tailPlaceOf(phrase));
}

describe('bannerStyleFor', () => {
  test('renders nothing without a persona — the phrase-less guard', async () => {
    expect(bannerStyleFor(null, 'fernhollow')).toBeNull();
    expect(bannerStyleFor(undefined, 'fernhollow')).toBeNull();
  });

  test('renders nothing without a real place word', async () => {
    const persona = await personaFromViewPhrase(`${HEAD}-${TAIL_ADJ}-fernhollow`);
    expect(bannerStyleFor(persona, null)).toBeNull();
    expect(bannerStyleFor(persona, 'notaplace')).toBeNull();
  });

  test('the family follows the place word', async () => {
    const hollow = await styleFor(HEAD, 'fernhollow');
    const shore = await styleFor(HEAD, 'fernshore');
    expect(hollow?.family).toBe('lowland');
    expect(shore?.family).toBe('coastal');
    expect(hollow?.familyClass).toBe('place-lowland');
  });

  // The claim that keeps the leak at ~3.55 bits: everything EXCEPT the family
  // is head-derived, so changing the tail alone changes only the family.
  test('same head, different place: only family-derived fields move', async () => {
    const a = await styleFor(HEAD, 'fernhollow');
    const b = await styleFor(HEAD, 'fernshore');
    expect(a?.variantClass).toBe(b?.variantClass);
    expect(a?.timeClass).toBe(b?.timeClass);
    expect(a?.density).toBe(b?.density);
    expect(a?.family).not.toBe(b?.family);
  });

  test('the tail ADJECTIVES are never readable off the banner', async () => {
    const a = await styleFor(HEAD, 'fernhollow', 'mistlit-moonworn');
    const b = await styleFor(HEAD, 'fernhollow', 'wolfsworn-ravenetched');
    expect(a).toEqual(b);
  });

  test('the base within a family is never readable off the banner', async () => {
    const a = await styleFor(HEAD, 'fernhollow');
    const b = await styleFor(HEAD, 'stonehollow');
    expect(a).toEqual(b);
  });

  // The other direction: same place, different creature, visibly different
  // banner. This is what stops every axolotl page looking identical.
  test('same place, different head: variation moves and costs nothing', async () => {
    const a = await styleFor(HEAD, 'fernhollow');
    const b = await styleFor(OTHER_HEAD, 'fernhollow');
    expect(a?.family).toBe(b?.family);
    const differs =
      a?.variantClass !== b?.variantClass ||
      a?.timeClass !== b?.timeClass ||
      a?.density !== b?.density;
    expect(differs).toBe(true);
  });

  test('class names and density stay in range', async () => {
    for (const place of ['fernhollow', 'fernshore', 'ferncliff', 'fernburrow', 'ferngarden']) {
      const s = await styleFor(HEAD, place);
      expect(s?.variantClass).toMatch(/^place-v[0-7]$/);
      expect(s?.timeClass).toMatch(/^place-t[0-3]$/);
      expect(s?.density).toBeGreaterThanOrEqual(0);
      expect(s?.density).toBeLessThanOrEqual(3);
    }
  });
});
