import { INTEREST_LEVELS, type Item, type Section } from './types';
import { SECTIONS } from './sections';

export interface ItemRef {
  readonly section: Section;
  readonly item: Item;
}

export function getSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}

export function getItem(id: string): ItemRef | null {
  for (const section of SECTIONS) {
    const item = section.items.find((i) => i.id === id);
    if (item) return { section, item };
  }
  return null;
}

export function allItems(): ItemRef[] {
  return SECTIONS.flatMap((section) => section.items.map((item) => ({ section, item })));
}

/** Items whose answers travel in the open part of a shared payload. */
export function openItems(): ItemRef[] {
  return allItems().filter(({ section }) => section.privacy === 'open');
}

/** Items that are only ever shared as hashed match tokens. */
export function matchItems(): ItemRef[] {
  return allItems().filter(({ section }) => section.privacy === 'match');
}

/** The short first pass — the minimum answer set for a meaningful compare. */
export function coreItems(): ItemRef[] {
  return allItems().filter(({ item }) => item.tier === 'core');
}

export function interestLabel(level: number): string {
  return INTEREST_LEVELS.find((l) => l.value === level)?.label ?? String(level);
}
