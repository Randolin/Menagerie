import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Person slots have to be distinguishable FROM EACH OTHER, which is a
 * different question from whether each is legible ON the page.
 *
 * `contrast.spec.ts` asks the second question, and asking only that one is
 * how the palette broke: darkening slots 3 and 4 to clear 3:1 against the
 * surface pushed orange and amber to 2.5 apart under simulated protanopia —
 * indistinguishable, and near-indistinguishable (12.1) even with full colour
 * vision. Nothing failed, because nothing was measuring it.
 *
 * The pairing is ALL pairs, not adjacent ones. In a bar chart only
 * neighbouring series touch; here four people's dots share one scale strip,
 * so any two can land side by side.
 *
 * Method: simulate protanopia and deuteranopia with the Machado, Oliveira &
 * Fernandes (2009) transforms at severity 1.0 in linear RGB, then measure
 * Euclidean distance in OKLab ×100. Tritanopia is reported by the reference
 * tool but not gated — it is rarer, and gating it costs a hue the other two
 * need. These are the same transforms and the same metric the visualisation
 * reference uses, so this spec and that tool cannot disagree.
 */
const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '_tokens.scss'), 'utf8');

/**
 * The target from the reference. 6–8 is a floor that is legal only when
 * something other than hue also separates the marks; below 6 nothing rescues
 * it. The palette clears 8 in both modes, so the app is not spending that
 * allowance — and if a future edit drops into the band, this fails and makes
 * that a decision rather than an accident.
 */
const CVD_TARGET = 8;
/** Below this, a full-colour reader struggles too — no relief applies. */
const NORMAL_FLOOR = 15;

const MACHADO: Readonly<Record<string, readonly (readonly number[])[]>> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

function linear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const to = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => to(parseInt(h.slice(i, i + 2), 16) / 255));
  return [r, g, b];
}

function simulate(rgb: readonly number[], kind: keyof typeof MACHADO): number[] {
  const m = MACHADO[kind];
  return m.map((row) =>
    Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
  );
}

function oklab([r, g, b]: readonly number[]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a: string, b: string, kind?: keyof typeof MACHADO): number {
  const one = oklab(kind ? simulate(linear(a), kind) : linear(a));
  const two = oklab(kind ? simulate(linear(b), kind) : linear(b));
  return 100 * Math.hypot(one[0] - two[0], one[1] - two[1], one[2] - two[2]);
}

function seriesOf(theme: 'light' | 'dark'): string[] {
  const block =
    theme === 'light'
      ? TOKENS.slice(TOKENS.indexOf(':root {'), TOKENS.indexOf('@mixin dark-tokens'))
      : TOKENS.slice(TOKENS.indexOf('@mixin dark-tokens'));
  return [1, 2, 3, 4].map((n) => {
    const found = new RegExp(`--series-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
    if (!found) throw new Error(`--series-${n} not found in the ${theme} block`);
    return found[1];
  });
}

describe('person slots stay tellable apart', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`survives protanopia and deuteranopia in ${theme} mode`, () => {
      const series = seriesOf(theme);
      const failures: string[] = [];
      for (let i = 0; i < series.length; i++) {
        for (let j = i + 1; j < series.length; j++) {
          for (const kind of ['protan', 'deutan'] as const) {
            const d = deltaE(series[i], series[j], kind);
            if (d < CVD_TARGET) {
              failures.push(
                `${series[i]}↔${series[j]} ΔE ${d.toFixed(1)} (${kind}) — need ${CVD_TARGET}`,
              );
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it(`keeps the slots apart for full colour vision too in ${theme} mode`, () => {
      const series = seriesOf(theme);
      const failures: string[] = [];
      for (let i = 0; i < series.length; i++) {
        for (let j = i + 1; j < series.length; j++) {
          const d = deltaE(series[i], series[j]);
          if (d < NORMAL_FLOOR) failures.push(`${series[i]}↔${series[j]} ΔE ${d.toFixed(1)}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('separates the two-person case by a wide margin, since it is nearly every comparison', () => {
    // Most comparisons are a pair. That case should not merely pass; it should
    // be unmistakable, which is what lets the four-way case spend its budget
    // on the harder slots.
    for (const theme of ['light', 'dark'] as const) {
      const [one, two] = seriesOf(theme);
      for (const kind of ['protan', 'deutan'] as const) {
        expect(deltaE(one, two, kind), `${theme} ${kind}`).toBeGreaterThan(20);
      }
    }
  });
});
