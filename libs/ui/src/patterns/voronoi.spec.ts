// Correctness of the Voronoi construction. The defining property is testable
// directly: every point inside a cell must be nearer to that cell's own site
// than to any other site. Sampling that property is what separates a real
// diagram from jittered polygons that merely look like one.
import { describe, expect, test } from 'vitest';
import { mulberry32 } from './rng';
import { shrinkPolygon, voronoiCells, type Point } from './voronoi';

const W = 320;
const H = 72;

function sites(n: number, seed: number): Point[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * H }));
}

function centroid(poly: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

function d2(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

describe('voronoiCells', () => {
  test('returns one cell per site', () => {
    const s = sites(20, 1);
    expect(voronoiCells(s, W, H)).toHaveLength(20);
  });

  // The defining property.
  test("a cell's interior points are nearest to that cell's own site", () => {
    const s = sites(24, 7);
    const cells = voronoiCells(s, W, H);
    for (let i = 0; i < s.length; i++) {
      const cell = cells[i];
      if (cell.length < 3) continue;
      const c = centroid(cell);
      // Sample toward the centroid to stay strictly inside, away from edges
      // where ties are legitimate.
      for (const v of cell) {
        const p = { x: c.x + (v.x - c.x) * 0.7, y: c.y + (v.y - c.y) * 0.7 };
        const own = d2(p, s[i]);
        for (let j = 0; j < s.length; j++) {
          if (j === i) continue;
          expect(own).toBeLessThanOrEqual(d2(p, s[j]) + 1e-6);
        }
      }
    }
  });

  test('cells stay inside the bounding rectangle', () => {
    for (const cell of voronoiCells(sites(18, 3), W, H)) {
      for (const p of cell) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(W + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(H + 1e-6);
      }
    }
  });

  test('cells tile the rectangle — areas sum to its area', () => {
    const area = (poly: readonly Point[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    };
    const total = voronoiCells(sites(22, 11), W, H).reduce((sum, c) => sum + area(c), 0);
    expect(total).toBeCloseTo(W * H, 1);
  });

  test('a single site owns the whole rectangle', () => {
    const [cell] = voronoiCells([{ x: 10, y: 10 }], W, H);
    expect(cell).toHaveLength(4);
  });

  test('duplicate sites degrade to empty cells, not crashes', () => {
    const p = { x: 5, y: 5 };
    const cells = voronoiCells([p, { ...p }, { x: 100, y: 40 }], W, H);
    expect(cells).toHaveLength(3);
    for (const c of cells) expect(Array.isArray(c)).toBe(true);
  });
});

describe('shrinkPolygon', () => {
  test('factor 1 is identity; 0 collapses to the centroid', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(shrinkPolygon(square, 1)).toEqual(square);
    for (const p of shrinkPolygon(square, 0)) {
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(5);
    }
  });

  test('empty in, empty out', () => {
    expect(shrinkPolygon([], 0.5)).toEqual([]);
  });
});
