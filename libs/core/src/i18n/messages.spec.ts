import { afterEach, describe, expect, test } from 'vitest';
import checkedIn from './messages.en.json';
import { sourceCatalogue } from './catalogue';
import { clearMessages, loadMessages, message, type MessageBag } from './messages';
import { SECTIONS } from '../schema/sections';
import { answerChips, importanceLabel, interestLabel, itemLabel } from '../schema/schema';
import {
  importanceLabels,
  interestLevelLabels,
  optionLabels,
  scaleEnds,
  sectionBlurb,
  sectionTitle,
} from '../schema/labels';
import { IMPORTANCE_WEIGHTS, INTEREST_LEVELS } from '../schema/types';

/** Every key translated to a visible marker — anything English left is a leak. */
function markerBag(): MessageBag {
  const bag: Record<string, string> = {};
  for (const key of Object.keys(sourceCatalogue())) bag[key] = `«${key}»`;
  return bag;
}

describe('the domain message catalogue', () => {
  afterEach(() => clearMessages());

  test('matches the schema it was extracted from', () => {
    // The guard: add or relabel a question without `npm run i18n:extract` and
    // this is what tells you, before a translator inherits a stale file.
    expect(sourceCatalogue()).toEqual(checkedIn);
  });

  test('keys name positions, never words', () => {
    for (const [key, source] of Object.entries(sourceCatalogue())) {
      // Only the schema's own permanent identifiers, which the freeze fixture
      // already pins. A key built from the English would die on relabelling —
      // the one edit the append-only rule explicitly allows.
      expect(key, key).toMatch(
        /^(sec\.[a-z-]+\.(title|blurb)|it\.[a-z0-9.]+\.(label|left|right|o\d+)|lvl\.[0-3]|imp\.[1-3])$/,
      );
      expect(source.trim(), key).not.toBe('');
    }
  });

  test('covers every string the schema can show', () => {
    loadMessages(markerBag());
    const untranslated: string[] = [];
    const check = (what: string, rendered: string): void => {
      if (!rendered.includes('«')) untranslated.push(`${what}: ${rendered}`);
    };

    for (const section of SECTIONS) {
      check(`section ${section.id} title`, sectionTitle(section));
      check(`section ${section.id} blurb`, sectionBlurb(section));
      for (const item of section.items) {
        check(`item ${item.id}`, itemLabel(item));
        if (item.type === 'scale') {
          const ends = scaleEnds(item)!;
          check(`scale ${item.id} left`, ends[0]);
          check(`scale ${item.id} right`, ends[1]);
        }
        for (const option of optionLabels(item)) check(`option of ${item.id}`, option);
      }
    }
    for (const level of INTEREST_LEVELS) check('interest level', interestLabel(level.value));
    for (const weight of IMPORTANCE_WEIGHTS) {
      check('importance', importanceLabel(weight.value)!);
    }
    expect(untranslated).toEqual([]);
  });

  test('answers render through the catalogue too', () => {
    const item = SECTIONS.flatMap((s) => s.items).find((i) => i.type === 'multi')!;
    expect(answerChips(item, [0])).toEqual([item.options[0]]);
    loadMessages(markerBag());
    // answerChips is the single funnel every text renderer shares, so a
    // translation that stopped at labels would show translated questions with
    // English answers — the exact half-done state that reads as a bug.
    expect(answerChips(item, [0])![0]).toContain('«');
  });

  test('a missing or blank translation shows English, never a gap', () => {
    const section = SECTIONS[0];
    loadMessages({ [`sec.${section.id}.title`]: '' });
    expect(sectionTitle(section)).toBe(section.title);
    loadMessages({ 'sec.nope.title': 'irrelevant' });
    expect(sectionTitle(section)).toBe(section.title);
    expect(message('absent.key', 'fallback')).toBe('fallback');
  });

  test('clearing goes back to source English', () => {
    const section = SECTIONS[0];
    loadMessages(markerBag());
    expect(sectionTitle(section)).not.toBe(section.title);
    clearMessages();
    expect(sectionTitle(section)).toBe(section.title);
    expect(interestLevelLabels()).toEqual(INTEREST_LEVELS.map((l) => l.label));
    expect(importanceLabels()).toEqual(IMPORTANCE_WEIGHTS.map((w) => w.label));
  });
});
