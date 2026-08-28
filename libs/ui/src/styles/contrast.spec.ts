import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contrast is measurable, so it is testable, so it should not rely on anyone
 * remembering to check. Two of these values were real AA failures found by
 * measuring rather than by looking — `--muted` at 3.4:1 under the `.fine`
 * text it exists for, and the fourth series hue at 2.1:1, below even the 3:1
 * that non-text graphics need.
 *
 * Reads the token file rather than a rendered page: the values are the
 * contract, and a headless browser would only tell us the same numbers more
 * slowly.
 */
const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '_tokens.scss'), 'utf8');

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Read a token's hex value from the light block or the dark mixin. */
function token(name: string, theme: 'light' | 'dark'): string {
  const block =
    theme === 'light'
      ? TOKENS.slice(TOKENS.indexOf(':root {'), TOKENS.indexOf('@mixin dark-tokens'))
      : TOKENS.slice(TOKENS.indexOf('@mixin dark-tokens'));
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`no hex value for --${name} in the ${theme} palette`);
  return match[1];
}

describe('token contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      // AA for normal text. --muted is the colour of `.fine`, which carries
      // the honest-limits copy — the last text in this app that should be
      // hard to read.
      it('gives muted text 4.5:1 against both the page and a card', () => {
        for (const surface of ['page', 'surface'] as const) {
          const ratio = contrast(token('muted', theme), token(surface, theme));
          expect(ratio, `--muted on --${surface} (${theme})`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('gives secondary ink 4.5:1 against a card', () => {
        expect(contrast(token('ink-2', theme), token('surface', theme))).toBeGreaterThanOrEqual(
          4.5,
        );
      });

      it('gives the accent and danger colours 4.5:1 against a card', () => {
        for (const name of ['accent', 'danger'] as const) {
          const ratio = contrast(token(name, theme), token('surface', theme));
          expect(ratio, `--${name} (${theme})`).toBeGreaterThanOrEqual(4.5);
        }
      });

      // Non-text graphics: 3:1 is the bar, and a series colour that misses it
      // is a person's line nobody can see.
      it('gives every series hue 3:1 as a graphic', () => {
        for (const n of [1, 2, 3, 4]) {
          const ratio = contrast(token(`series-${n}`, theme), token('surface', theme));
          expect(ratio, `--series-${n} (${theme})`).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }

  it('answers the contrast and forced-colours preferences at all', () => {
    expect(TOKENS).toContain('prefers-contrast: more');
    expect(TOKENS).toContain('forced-colors: active');
    // Charts opt out of forced colours on purpose: four lines all painted
    // CanvasText are four identical lines.
    expect(TOKENS).toContain('forced-color-adjust: none');
  });
});
