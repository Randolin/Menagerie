import { SECTIONS } from '../schema/sections';
import { IMPORTANCE_WEIGHTS, INTEREST_LEVELS } from '../schema/types';
import { optionKey, sectionBlurbKey, sectionTitleKey } from '../schema/labels';

/**
 * Every translatable string the domain owns, keyed the way `labels.ts` reads
 * them back.
 *
 * One function, used by two callers that must never disagree: the extraction
 * script that writes `messages.en.json`, and the spec that fails when the
 * checked-in file no longer matches the schema. That is the whole guard —
 * add a question, forget to re-extract, and CI says so, which is the only
 * reason a catalogue stays true to the code it describes.
 *
 * Insertion order is schema order, so the file a translator opens reads in
 * the same sequence as the survey rather than alphabetically by id.
 */
export function sourceCatalogue(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, source: string): void => {
    if (key in out) throw new Error(`duplicate message key: ${key}`);
    out[key] = source;
  };

  for (const section of SECTIONS) {
    put(sectionTitleKey(section), section.title);
    put(sectionBlurbKey(section), section.blurb);
    for (const item of section.items) {
      if (item.type === 'scale') {
        put(`it.${item.id}.left`, item.left);
        put(`it.${item.id}.right`, item.right);
        continue;
      }
      put(`it.${item.id}.label`, item.label);
      if (item.type === 'choice' || item.type === 'multi') {
        item.options.forEach((option, i) => put(optionKey(item, i), option));
      }
    }
  }

  // The two fixed vocabularies every answer is read through.
  for (const level of INTEREST_LEVELS) put(`lvl.${level.value}`, level.label);
  for (const weight of IMPORTANCE_WEIGHTS) put(`imp.${weight.value}`, weight.label);

  return out;
}
