import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Structural guard: nothing outside the message layer may read the schema's
 * words directly.
 *
 * `libs/core/src/i18n/messages.spec.ts` proves the domain's own renderers go
 * through the catalogue, but it cannot see a component that reaches past them
 * and interpolates `item().label` into a template. That component would work
 * perfectly, look right in review, and be the one untranslatable string on the
 * page — the failure mode that only shows up when somebody has already done
 * the work of translating everything else.
 *
 * So this is a source guard in the style of `no-angular.spec.ts`: read through
 * `itemLabel`, `optionLabel(s)`, `scaleEnds`, `sectionTitle`, `sectionBlurb`,
 * `interestLabel`, `importanceLabel`, `answerChips`. Never off the object.
 *
 * Arithmetic on `options.length` is fine and deliberately not matched — this
 * is about text that reaches a person, not about the shape of the data.
 */
const APP = dirname(fileURLToPath(import.meta.url));
const UI = join(APP, '../../libs/ui/src');

/** Each pattern is a way of reading schema copy that skips the catalogue. */
const FORBIDDEN: readonly { readonly re: RegExp; readonly use: string }[] = [
  { re: /\bitem\(\)\.label\b/, use: 'itemLabel(item())' },
  { re: /\bitem\.label\b/, use: 'itemLabel(item)' },
  { re: /\.item\.label\b/, use: 'itemLabel(row.item)' },
  { re: /\bitem\(\)\.options\b/, use: 'optionLabels(item())' },
  { re: /\bitem\.options\[/, use: 'optionLabel(item, index)' },
  { re: /\bitem\(\)\.(left|right)\b/, use: 'scaleEnds(item())' },
  { re: /\bsection\.(title|blurb)\b/, use: 'sectionTitle/sectionBlurb(section)' },
  { re: /\.section\.(title|blurb)\b/, use: 'sectionTitle/sectionBlurb(g.section)' },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts') || full.endsWith('.html')) yield full;
  }
}

describe('schema copy goes through the message layer', () => {
  it('is never read straight off an item or section', () => {
    const offenders: string[] = [];
    for (const root of [APP, UI]) {
      for (const file of walk(root)) {
        if (file.endsWith('.spec.ts')) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          // A line that already names the accessor is describing it, not
          // dodging it — the guard's own docs and comments included.
          if (/^\s*(\/\*|\*|\/\/)/.test(line)) return;
          for (const { re, use } of FORBIDDEN) {
            if (re.test(line)) {
              offenders.push(`${relative(APP, file)}:${i + 1} — use ${use}\n    ${line.trim()}`);
            }
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
