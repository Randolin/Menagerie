import { describe, expect, test } from 'vitest';
import { PACKS, getPack, visiblePacks } from './packs';
import { allItems } from './schema';

describe('packs', () => {
  test('partition the schema: every item in exactly one pack', () => {
    const seen = new Map<string, string>();
    for (const pack of PACKS) {
      for (const id of pack.itemIds) {
        expect(seen.has(id), `${id} in both ${seen.get(id)} and ${pack.id}`).toBe(false);
        seen.set(id, pack.id);
      }
    }
    const schemaIds = allItems().map(({ item }) => item.id);
    for (const id of schemaIds) {
      expect(seen.has(id), `item ${id} belongs to no pack`).toBe(true);
    }
    expect(seen.size, 'pack references a nonexistent item').toBe(schemaIds.length);
  });

  test('packs stay card-sized and well-formed', () => {
    const packIds = new Set<string>();
    for (const pack of PACKS) {
      expect(packIds.has(pack.id), `duplicate pack id ${pack.id}`).toBe(false);
      packIds.add(pack.id);
      expect(pack.title).toBeTruthy();
      expect(pack.emoji).toBeTruthy();
      expect(pack.blurb).toBeTruthy();
      expect(pack.itemIds.length).toBeGreaterThanOrEqual(2);
      expect(pack.itemIds.length).toBeLessThanOrEqual(26);
    }
    expect(getPack('hello')?.title).toBeTruthy();
    expect(getPack('nope')).toBeUndefined();
  });

  test('the ENM pack unlocks on non-mono signals only', () => {
    const ids = (answers: Record<string, number | number[]>) =>
      visiblePacks(answers).map((p) => p.id);

    expect(ids({})).not.toContain('open-hearts');
    expect(ids({ 'sk.mono': 3, 'sk.poly': 0 })).not.toContain('open-hearts');
    expect(ids({ 'sk.poly': 1 })).toContain('open-hearts');
    expect(ids({ 'sk.swing': 3 })).toContain('open-hearts');
    expect(ids({ 'st.ideal': [0] })).not.toContain('open-hearts'); // Monogamy
    expect(ids({ 'st.ideal': [3] })).toContain('open-hearts'); // Non-hierarchical poly
    expect(ids({ 'st.ideal': [8] })).not.toContain('open-hearts'); // Still figuring it out
    // Everything else is unconditional.
    expect(ids({}).length).toBe(PACKS.length - 1);
  });
});
