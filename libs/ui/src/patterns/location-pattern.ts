// Generated banner patterns — one visual language per landform family.
//
// WHAT MAY FEED THIS, AND WHAT MAY NOT:
//   family              ← the tail's place word. Selects WHICH generator runs.
//                         This is the 3.55 bits the ledger already accounts for.
//   seed, scale, density ← the PUBLIC head words. Control every coordinate,
//                         every jitter, every count.
//
// Geometry is a side channel just as much as colour is. If cell layout, scatter
// positions or rotation were seeded from the tail, a screenshot would fingerprint
// the place word even with the palette held constant — so `seed` is head-derived
// in libs/core banner.ts and this module has no access to the phrase at all. The
// only tail-shaped input it receives is the family name.
//
// Output is a plain SVG path/shape list so the component can render it inline:
// no runtime canvas, no measurement, no external library, and identical markup
// on server and client. Colour is NOT set here — every shape inherits
// currentColor and the stylesheet owns the palette (one authority per concern).
import type { PlaceFamily } from '@moxy/core';
import { mulberry32, range, round } from './rng';
import { shrinkPolygon, voronoiCells, type Point } from './voronoi';

/** Banner coordinate space; the SVG scales to fit via preserveAspectRatio. */
export const PATTERN_WIDTH = 320;
export const PATTERN_HEIGHT = 72;

export interface PatternShape {
  /** SVG path data. */
  readonly d: string;
  /** 0..1 — varied per shape so the field reads as depth, not a flat stencil. */
  readonly opacity: number;
  /** Stroke width in user units; 0 means fill instead of stroke. */
  readonly stroke: number;
}

interface Params {
  readonly rnd: () => number;
  /** 0.7 (coarse) .. 1.45 (fine) — head-derived. */
  readonly scale: number;
  /** Element count multiplier, 0.8 .. 1.4 — head-derived. */
  readonly amount: number;
}

const W = PATTERN_WIDTH;
const H = PATTERN_HEIGHT;

function poly(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ') + 'Z';
}

/** Angular cells — highland. Crystalline, hard edges. */
function shards({ rnd, scale, amount }: Params): PatternShape[] {
  const n = Math.round(22 * amount * scale);
  const sites: Point[] = Array.from({ length: n }, () => ({
    x: range(rnd, -10, W + 10),
    y: range(rnd, -10, H + 10),
  }));
  return voronoiCells(sites, W, H)
    .filter((c) => c.length >= 3)
    .map((cell) => ({
      d: poly(shrinkPolygon(cell, 0.86)),
      opacity: range(rnd, 0.05, 0.16),
      stroke: 0,
    }));
}

/** Voronoi outlines — underground. Cave-wall cracks rather than solid cells. */
function dendrite({ rnd, scale, amount }: Params): PatternShape[] {
  const n = Math.round(16 * amount * scale);
  const sites: Point[] = Array.from({ length: n }, () => ({
    x: range(rnd, -10, W + 10),
    y: range(rnd, -10, H + 10),
  }));
  return voronoiCells(sites, W, H)
    .filter((c) => c.length >= 3)
    .map((cell) => ({
      d: poly(shrinkPolygon(cell, 0.93)),
      opacity: range(rnd, 0.1, 0.24),
      stroke: range(rnd, 0.6, 1.3),
    }));
}

/** Stacked sine bands — coastal and spring. */
function waves({ rnd, scale, amount }: Params, tight: boolean): PatternShape[] {
  const rows = Math.round((tight ? 7 : 5) * amount);
  const out: PatternShape[] = [];
  for (let r = 0; r < rows; r++) {
    const baseY = ((r + 0.5) / rows) * H;
    const amp = range(rnd, 2.5, 7) / scale;
    const period = range(rnd, 40, 90) * scale;
    const phase = range(rnd, 0, Math.PI * 2);
    let d = '';
    for (let x = 0; x <= W; x += 8) {
      const y = baseY + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
      d += `${x === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
    }
    out.push({ d, opacity: range(rnd, 0.12, 0.3), stroke: range(rnd, 0.8, 1.8) });
  }
  return out;
}

/** Scattered blades — wetland (reeds) and openland (grass). */
function blades({ rnd, scale, amount }: Params, lean: number): PatternShape[] {
  const n = Math.round(34 * amount * scale);
  return Array.from({ length: n }, () => {
    const x = range(rnd, 0, W);
    const y = range(rnd, H * 0.25, H + 6);
    const h = range(rnd, 9, 26) / scale;
    const bend = range(rnd, -lean, lean);
    return {
      d: `M${round(x)} ${round(y)} Q${round(x + bend * 0.5)} ${round(y - h * 0.6)} ${round(x + bend)} ${round(y - h)}`,
      opacity: range(rnd, 0.12, 0.32),
      stroke: range(rnd, 0.7, 1.5),
    };
  });
}

/** Rounded leaf/petal scatter — lowland, woodland, tended. */
function scatter({ rnd, scale, amount }: Params, kind: 'leaf' | 'petal' | 'needle'): PatternShape[] {
  const n = Math.round((kind === 'needle' ? 40 : 26) * amount * scale);
  return Array.from({ length: n }, () => {
    const x = range(rnd, -6, W + 6);
    const y = range(rnd, -4, H + 4);
    const s = range(rnd, 10, 24) / scale;
    const a = range(rnd, 0, Math.PI * 2);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tip = { x: x + cos * s, y: y + sin * s };
    // Perpendicular offset sets how fat the shape is.
    const wob = kind === 'needle' ? s * 0.17 : kind === 'petal' ? s * 0.6 : s * 0.42;
    const px = -sin * wob;
    const py = cos * wob;
    return {
      d:
        `M${round(x)} ${round(y)} ` +
        `Q${round(x + cos * s * 0.5 + px)} ${round(y + sin * s * 0.5 + py)} ${round(tip.x)} ${round(tip.y)} ` +
        `Q${round(x + cos * s * 0.5 - px)} ${round(y + sin * s * 0.5 - py)} ${round(x)} ${round(y)}Z`,
      opacity: range(rnd, 0.14, 0.36),
      stroke: 0,
    };
  });
}

/** Interlocking blocks — stronghold. Offset courses, like masonry. */
function courses({ rnd, scale, amount }: Params): PatternShape[] {
  const rows = Math.round(5 * amount * scale);
  const rowH = H / rows;
  const out: PatternShape[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * range(rnd, 14, 26);
    const bw = range(rnd, 26, 46) * scale;
    for (let x = -offset; x < W; x += bw + 4) {
      out.push({
        d: poly([
          { x, y: r * rowH + 2 },
          { x: x + bw, y: r * rowH + 2 },
          { x: x + bw, y: (r + 1) * rowH - 2 },
          { x, y: (r + 1) * rowH - 2 },
        ]),
        opacity: range(rnd, 0.05, 0.15),
        stroke: 0,
      });
    }
  }
  return out;
}

/** Arches — threshold. Repeating spans, a way through. */
function arches({ rnd, scale, amount }: Params): PatternShape[] {
  const n = Math.max(4, Math.round(7 * amount * scale));
  const step = W / n;
  return Array.from({ length: n }, (_, i) => {
    const x = i * step + step / 2;
    const w = range(rnd, step * 0.3, step * 0.45);
    const h = range(rnd, H * 0.4, H * 0.8);
    return {
      d: `M${round(x - w)} ${round(H)} L${round(x - w)} ${round(H - h * 0.55)} Q${round(x)} ${round(H - h)} ${round(x + w)} ${round(H - h * 0.55)} L${round(x + w)} ${round(H)}`,
      opacity: range(rnd, 0.1, 0.24),
      stroke: range(rnd, 0.9, 1.8),
    };
  });
}

/** Rising specks — hearthside embers. */
function embers({ rnd, scale, amount }: Params): PatternShape[] {
  const n = Math.round(46 * amount * scale);
  return Array.from({ length: n }, () => {
    const x = range(rnd, 0, W);
    const y = range(rnd, 0, H);
    // Smaller and fainter toward the top: embers cool as they rise.
    const lift = 1 - y / H;
    const r = (range(rnd, 1.1, 3.2) * (1 - lift * 0.55)) / scale;
    return {
      d: `M${round(x)} ${round(y - r)} A${round(r)} ${round(r)} 0 1 0 ${round(x)} ${round(y + r)} A${round(r)} ${round(r)} 0 1 0 ${round(x)} ${round(y - r)}Z`,
      opacity: range(rnd, 0.12, 0.42) * (0.45 + lift * 0.55),
      stroke: 0,
    };
  });
}

/** Concentric rings — spring. Water surfacing. */
function ripples({ rnd, scale, amount }: Params): PatternShape[] {
  const centres = Math.round(4 * amount);
  const out: PatternShape[] = [];
  for (let c = 0; c < centres; c++) {
    const cx = range(rnd, 0, W);
    const cy = range(rnd, 0, H);
    const rings = Math.round(range(rnd, 2, 5));
    for (let i = 1; i <= rings; i++) {
      const r = (i * range(rnd, 6, 11)) / scale;
      out.push({
        d: `M${round(cx - r)} ${round(cy)} A${round(r)} ${round(r)} 0 1 0 ${round(cx + r)} ${round(cy)} A${round(r)} ${round(r)} 0 1 0 ${round(cx - r)} ${round(cy)}`,
        opacity: range(rnd, 0.14, 0.3) * (1 - i / (rings + 1)),
        stroke: range(rnd, 0.6, 1.2),
      });
    }
  }
  return out;
}

type Generator = (p: Params) => PatternShape[];

/**
 * One generator per family. Every family MUST have an entry — the exhaustive
 * Record type makes adding a family without a pattern a compile error rather
 * than a blank banner someone notices in production.
 */
const GENERATORS: Record<PlaceFamily, Generator> = {
  lowland: (p) => scatter(p, 'leaf'),
  wetland: (p) => blades(p, 7),
  highland: shards,
  coastal: (p) => waves(p, false),
  woodland: (p) => scatter(p, 'needle'),
  openland: (p) => blades(p, 3),
  threshold: arches,
  stronghold: courses,
  underground: dendrite,
  hearthside: embers,
  spring: ripples,
  tended: (p) => scatter(p, 'petal'),
};

/**
 * Deterministic for a given (family, seed, scale, density): the same profile
 * draws the same banner on every device and every reload, which is what makes
 * it something a person can recognise as theirs.
 */
export function locationPattern(
  family: PlaceFamily,
  seed: number,
  scale: number,
  density: number,
): PatternShape[] {
  const rnd = mulberry32(seed);
  return GENERATORS[family]({
    rnd,
    scale: 0.7 + (scale % 4) * 0.25,
    amount: 0.8 + (density % 4) * 0.2,
  });
}
