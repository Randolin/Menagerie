import { describe, expect, test } from 'vitest';
import { SECTIONS } from './sections';
import { allItems, matchItems, openItems } from './schema';
import freeze from './fixtures/schema-v1.freeze.json';

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
  });

  test('honors the v1 freeze: ids/types/sections/privacy immutable, options append-only', () => {
    const byId = new Map(
      allItems().map(({ section, item }) => [item.id, { section, item }]),
    );
    for (const [id, frozen] of Object.entries(freeze.items)) {
      const found = byId.get(id);
      expect(found, `frozen item ${id} was removed — old links would lose this answer`).toBeDefined();
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
});
