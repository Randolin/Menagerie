import { describe, expect, test } from 'vitest';
import { GATED_ITEM_IDS, isItemOffered, leansOpen, offeredItems } from './gating';
import { getItem, getSection } from './schema';
import { SECTIONS } from './sections';

describe('gated items', () => {
  test('every gated id is a real item — a typo would silently ungate it', () => {
    for (const id of GATED_ITEM_IDS) expect(getItem(id), id).not.toBeNull();
  });

  test('ungated items are always offered', () => {
    expect(isItemOffered('ab.age', {})).toBe(true);
    expect(isItemOffered('sk.poly', {})).toBe(true);
  });

  test('gated items are withheld until the condition holds', () => {
    for (const id of GATED_ITEM_IDS) {
      expect(isItemOffered(id, {}), id).toBe(false);
      expect(isItemOffered(id, { 'sk.poly': 2 }), id).toBe(true);
    }
  });

  // Hiding an item that already carries an answer would make it uneditable
  // while it kept counting toward the profile.
  test('an already-answered gated item stays offered', () => {
    for (const id of GATED_ITEM_IDS) {
      expect(isItemOffered(id, { [id]: 3 }), id).toBe(true);
    }
  });
});

describe('leansOpen', () => {
  test('no signal', () => {
    expect(leansOpen({})).toBe(false);
    expect(leansOpen({ 'sk.poly': 0 })).toBe(false);
    expect(leansOpen({ 'st.ideal': [0] })).toBe(false);
    expect(leansOpen({ 'st.ideal': [7, 8] })).toBe(false);
  });

  test('any positive non-mono interest opens it', () => {
    for (const id of ['sk.poly', 'sk.open', 'sk.swing', 'sk.ra']) {
      expect(leansOpen({ [id]: 1 }), id).toBe(true);
      expect(leansOpen({ [id]: 3 }), id).toBe(true);
    }
  });

  test('a non-mono structure choice opens it', () => {
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(leansOpen({ 'st.ideal': [i] }), `index ${i}`).toBe(true);
    }
  });
});

describe('offeredItems', () => {
  test('filters a section without reordering it', () => {
    const structure = getSection('structure')!;
    const shown = offeredItems(structure, {});
    expect(shown.length).toBe(structure.items.length - GATED_ITEM_IDS.length);
    const order = structure.items.map((i) => i.id).filter((id) => shown.some((s) => s.id === id));
    expect(shown.map((i) => i.id)).toEqual(order);
  });

  test('opens up once the condition holds', () => {
    const structure = getSection('structure')!;
    expect(offeredItems(structure, { 'sk.poly': 2 })).toHaveLength(structure.items.length);
  });

  test('no other section is gated', () => {
    for (const s of SECTIONS) {
      if (s.id === 'structure') continue;
      expect(offeredItems(s, {}).length, s.id).toBe(s.items.length);
    }
  });
});
