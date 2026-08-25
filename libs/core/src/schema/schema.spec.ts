import { describe, expect, test } from 'vitest';
import { SECTIONS } from './sections';
import { RETIRED_ITEM_IDS, RETIRED_SECTION_IDS } from './retired';
import { allItems, coreItems, matchItems, openItems } from './schema';
import freeze from './fixtures/schema-v2.freeze.json';

describe('schema', () => {
  test('is internally consistent', () => {
    const ids = new Set<string>();
    for (const { item } of allItems()) {
      expect(ids.has(item.id), `duplicate id ${item.id}`).toBe(false);
      ids.add(item.id);
      if (item.type === 'choice' || item.type === 'multi') {
        expect(item.options.length, item.id).toBeGreaterThanOrEqual(2);
      }
      if (item.type === 'scale') {
        expect(item.left, item.id).toBeTruthy();
        expect(item.right, item.id).toBeTruthy();
      }
    }
    expect(openItems().length).toBeGreaterThan(30);
    expect(matchItems().length).toBeGreaterThanOrEqual(20);
    expect(SECTIONS.find((s) => s.id === 'desires')?.privacy).toBe('match');
    // The core tier is the short first pass — keep it meaningful but short.
    expect(coreItems().length).toBeGreaterThanOrEqual(15);
    expect(coreItems().length).toBeLessThanOrEqual(30);
    expect(coreItems().every(({ section }) => section.privacy === 'open')).toBe(true);
  });

  test('honors the v2 freeze: ids/types/sections/privacy immutable, options append-only', () => {
    const byId = new Map(allItems().map(({ section, item }) => [item.id, { section, item }]));
    for (const [id, frozen] of Object.entries(freeze.items)) {
      const found = byId.get(id);
      expect(
        found,
        `frozen item ${id} was removed — old links would lose this answer`,
      ).toBeDefined();
      const { section, item } = found!;
      expect(item.type, `${id}: type changed`).toBe(frozen.type);
      expect(section.id, `${id}: moved to another section`).toBe(frozen.section);
      expect(section.privacy, `${id}: privacy tier changed`).toBe(frozen.privacy);
      if ('minOptions' in frozen && frozen.minOptions !== undefined) {
        const opts = (item as { options?: readonly string[] }).options ?? [];
        expect(
          opts.length,
          `${id}: options shrank — indexes in old links would dangle`,
        ).toBeGreaterThanOrEqual(frozen.minOptions as number);
      }
    }
  });

  test('retired ids never come back', () => {
    const itemIds = new Set(allItems().map(({ item }) => item.id));
    for (const id of RETIRED_ITEM_IDS) {
      expect(itemIds.has(id), `retired item id ${id} was reused`).toBe(false);
      // Retired ids also stay out of the freeze — they are gone, not frozen.
      expect(id in freeze.items, `retired id ${id} present in freeze`).toBe(false);
    }
    for (const id of RETIRED_SECTION_IDS) {
      expect(
        SECTIONS.some((s) => s.id === id),
        `retired section id ${id} was reused`,
      ).toBe(false);
    }
  });
});
