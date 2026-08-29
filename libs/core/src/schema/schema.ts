import {
  IMPORTANCE_WEIGHTS,
  INTEREST_LEVELS,
  SCALE_MAX,
  type AnswerValue,
  type ImportanceWeight,
  type Item,
  type Section,
} from './types';
import { SECTIONS } from './sections';
import { message } from '../i18n/messages';
import { optionLabel, scaleEnds } from './labels';

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
  const found = INTEREST_LEVELS.find((l) => l.value === level);
  return found ? message(`lvl.${found.value}`, found.label) : String(level);
}

/**
 * What to call an item on screen. Scales have no single label — they are two
 * opposed anchors — so they render as the pair, which is what a person needs
 * to read a scale's answer at all.
 */
export function itemLabel(item: Item): string {
  if ('label' in item) return message(`it.${item.id}.label`, item.label);
  const [left, right] = scaleEnds(item)!;
  return `${left} ↔ ${right}`;
}

export function importanceLabel(weight: ImportanceWeight | undefined): string | undefined {
  const found = IMPORTANCE_WEIGHTS.find((d) => d.value === weight);
  return found && message(`imp.${found.value}`, found.label);
}

/**
 * Canonical readable form of an answer — one chip per selected option, null
 * when unanswered. The single source every text renderer shares; a new item
 * type fails compilation here until it renders.
 */
export function answerChips(item: Item, value: AnswerValue | null | undefined): string[] | null {
  if (value === null || value === undefined) return null;
  switch (item.type) {
    case 'choice':
      return [optionLabel(item, value as number)];
    case 'multi':
      return (Array.isArray(value) ? value : []).map((i) => optionLabel(item, i));
    case 'scale':
      return [`${value}/${SCALE_MAX}`];
    case 'interest':
      return [interestLabel(value as number)];
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
