import { message } from '../i18n/messages';
import { IMPORTANCE_WEIGHTS, INTEREST_LEVELS, type Item, type Section } from './types';

/**
 * Every string the schema shows a person, addressed by a key that outlives
 * the words.
 *
 * The keys are built from item ids and option indexes because those are the
 * two things this codebase has already promised never to change: ids are
 * forever and options are append-only, both enforced by `schema.spec.ts`
 * against the checked-in freeze fixture. So a key minted today still names
 * the same question and the same option in five years, and a translator's
 * work survives every edit the schema is allowed to make.
 *
 * The rule for callers: never read `item.label`, `item.options[i]`,
 * `section.title` or a scale anchor directly for display. Read them through
 * here. `messages.spec.ts` walks the schema and fails when a key is missing
 * from the checked-in catalogue, which is what stops new copy from quietly
 * arriving untranslatable.
 */

export function sectionTitleKey(section: Section): string {
  return `sec.${section.id}.title`;
}

export function sectionTitle(section: Section): string {
  return message(sectionTitleKey(section), section.title);
}

export function sectionBlurbKey(section: Section): string {
  return `sec.${section.id}.blurb`;
}

export function sectionBlurb(section: Section): string {
  return message(sectionBlurbKey(section), section.blurb);
}

export function optionKey(item: Item, index: number): string {
  return `it.${item.id}.o${index}`;
}

/** One option's display text. Out-of-range yields '?', as answerChips does. */
export function optionLabel(item: Item, index: number): string {
  if (item.type !== 'choice' && item.type !== 'multi') return '?';
  const source = item.options[index];
  return source === undefined ? '?' : message(optionKey(item, index), source);
}

/** All of an item's options, in their frozen order. */
export function optionLabels(item: Item): readonly string[] {
  if (item.type !== 'choice' && item.type !== 'multi') return [];
  return item.options.map((source, i) => message(optionKey(item, i), source));
}

/** The two anchors of a scale, left then right. Empty for other types. */
export function scaleEnds(item: Item): readonly [string, string] | null {
  if (item.type !== 'scale') return null;
  return [message(`it.${item.id}.left`, item.left), message(`it.${item.id}.right`, item.right)];
}

export function interestLevelLabels(): readonly string[] {
  return INTEREST_LEVELS.map((l) => message(`lvl.${l.value}`, l.label));
}

export function importanceLabels(): readonly string[] {
  return IMPORTANCE_WEIGHTS.map((w) => message(`imp.${w.value}`, w.label));
}
