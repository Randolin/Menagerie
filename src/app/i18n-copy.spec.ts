import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Structural guard: copy a translator can never reach.
 *
 * Angular's `i18n` marker covers text nodes, and the pseudo-locale e2e shows
 * what it missed — but only to someone looking at the screenshot. Two shapes
 * slip past both, and this codebase has now shipped three of them:
 *
 *   {{ saving() ? 'Saving…' : 'Save now' }}     ← a literal inside an
 *                                                  interpolation, invisible
 *                                                  to any text-node pass
 *   <button title="My profile">                 ← a static attribute with no
 *                                                  matching i18n-title
 *   [attr.aria-label]="'Remove ' + name()"      ← a literal inside a BOUND
 *                                                  translatable attribute
 *
 * All three compile, all three review clean, and all three are simply
 * untranslatable. The fix for the first is `@if`/`@else` with marked spans;
 * for the second, an `i18n-<attr>` beside the attribute; for the third,
 * `$localize` in the component, since a binding has no `i18n-` form.
 *
 * The third was this guard's own blind spot. It used to say a bound attribute
 * was "the component's problem, caught by the interpolation rule or by the
 * reviewer" — but a binding is not an interpolation, so nothing checked it,
 * and nineteen English strings were sitting in `[title]` and
 * `[attr.aria-label]` across the app when the rule was finally written.
 *
 * Punctuation, symbols and emoji are deliberately not copy: `'⛔'` and `': '`
 * are the same in every language, and demanding markers for them would make
 * the guard something people route around.
 */
const APP = dirname(fileURLToPath(import.meta.url));
const UI = join(APP, '../../libs/ui/src');

/** Attributes a person reads. Anything here needs an i18n-<attr> sibling. */
const TRANSLATABLE_ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'caption'] as const;

/** Two consecutive letters — enough to be a word, never punctuation. */
const IS_COPY = /[A-Za-z]{2}/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts') || full.endsWith('.html')) yield full;
  }
}

/** The inline `template:` blocks of a component file, or a whole .html file. */
function templatesOf(file: string, source: string): string[] {
  if (file.endsWith('.html')) return [source];
  return [...source.matchAll(/ {2}template: `(.*?)`,\n/gs)].map((m) => m[1]);
}

/**
 * Quoted string literals inside an expression, extracted by scanning.
 *
 * A regex cannot do this: a greedy quote match happily spans from one
 * literal's opener to the next literal's closer, swallowing the code between
 * them and reporting words that were never strings.
 */
function literalsIn(body: string): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      const end = body.indexOf(ch, i + 1);
      if (end < 0) break;
      found.push(body.slice(i + 1, end));
      i = end + 1;
    } else {
      i++;
    }
  }
  return found;
}

/** Literals inside `{{ … }}`. */
function literalsInInterpolations(template: string): string[] {
  return [...template.matchAll(/\{\{(.*?)\}\}/gs)].flatMap(([, body]) => literalsIn(body));
}

/**
 * Literals inside a bound translatable attribute — `[title]="'Copy ' + x"`.
 *
 * Only the attributes a person actually reads, which is what keeps this from
 * firing on `[routerLink]="'/me'"`: a path is not copy, but "me" would pass
 * the two-letter test and there is no way to tell them apart by shape.
 */
function literalsInBoundAttributes(template: string): string[] {
  const names = TRANSLATABLE_ATTRS.join('|');
  const bound = new RegExp(`\\[(?:attr\\.)?(?:${names})\\]="([^"]*)"`, 'g');
  return [...template.matchAll(bound)].flatMap(([, expr]) => literalsIn(expr));
}

function unmarkedAttributes(template: string): string[] {
  const found: string[] = [];
  for (const [, attrs] of template.matchAll(
    /<[a-zA-Z][\w-]*((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>/gs,
  )) {
    for (const name of TRANSLATABLE_ATTRS) {
      // Static values only: a bound `[title]="…"` is an expression, and its
      // words are the component's problem, caught by the interpolation rule
      // or by the reviewer.
      const match = new RegExp(`(?<![\\w-])${name}="([^"{}]*)"`).exec(attrs);
      if (!match || !IS_COPY.test(match[1])) continue;
      if (new RegExp(`(?<![\\w-])i18n-${name}(?![\\w-])`).test(attrs)) continue;
      found.push(`${name}="${match[1]}"`);
    }
  }
  return found;
}

describe('app copy is reachable by a translator', () => {
  it('never hides a string inside an interpolation or an unmarked attribute', () => {
    const offenders: string[] = [];
    for (const root of [APP, UI]) {
      for (const file of walk(root)) {
        if (file.endsWith('.spec.ts')) continue;
        const source = readFileSync(file, 'utf8');
        const where = relative(APP, file);
        for (const template of templatesOf(file, source)) {
          for (const literal of literalsInInterpolations(template)) {
            if (IS_COPY.test(literal)) {
              offenders.push(`${where} — @if/@else with marked spans, not {{ … '${literal}' }}`);
            }
          }
          for (const literal of literalsInBoundAttributes(template)) {
            if (IS_COPY.test(literal)) {
              offenders.push(
                `${where} — $localize in the component, not [attr]="'${literal}' + …"`,
              );
            }
          }
          for (const attr of unmarkedAttributes(template)) {
            offenders.push(`${where} — needs an i18n- marker beside ${attr}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
