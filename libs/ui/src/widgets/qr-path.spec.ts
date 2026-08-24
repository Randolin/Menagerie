import { describe, expect, test } from 'vitest';
import { blobPath } from './qr-path';

/** Build an isDark accessor from rows of '#' (dark) and '.' (light). */
function grid(rows: readonly string[]): { isDark: (r: number, c: number) => boolean; n: number } {
  return { isDark: (r, c) => rows[r]?.[c] === '#', n: rows.length };
}

const arcs = (d: string): number => (d.match(/A/g) ?? []).length;

describe('blobPath', () => {
  test('isolated module rounds all four corners', () => {
    const { isDark, n } = grid(['...', '.#.', '...']);
    const d = blobPath(isDark, n, 0);
    expect(arcs(d)).toBe(4);
    expect(d.match(/M/g)).toHaveLength(1);
  });

  test('horizontal pair fuses into a pill: outer corners round, shared edge square', () => {
    const { isDark, n } = grid(['....', '.##.', '....', '....']);
    const d = blobPath(isDark, n, 0);
    // Two subpaths, each rounding only its two outer corners.
    expect(d.match(/M/g)).toHaveLength(2);
    expect(arcs(d)).toBe(4);
  });

  test('diagonal pair keeps the meeting corners square (no pinch gap)', () => {
    const { isDark, n } = grid(['#..', '.#.', '...']);
    const d = blobPath(isDark, n, 0);
    // 8 corners total; the two facing the diagonal contact stay square.
    expect(arcs(d)).toBe(6);
  });

  test('2x2 block rounds only the four outer corners', () => {
    const { isDark, n } = grid(['....', '.##.', '.##.', '....']);
    const d = blobPath(isDark, n, 0);
    expect(arcs(d)).toBe(4);
  });

  test('honors the quiet-zone offset (single module spans offset..offset+1 only)', () => {
    const { isDark, n } = grid(['#']);
    expect(blobPath(isDark, n, 4)).toBe(
      'M4.42 4H4.58A0.42 0.42 0 0 1 5 4.42V4.58A0.42 0.42 0 0 1 4.58 5H4.42' +
        'A0.42 0.42 0 0 1 4 4.58V4.42A0.42 0.42 0 0 1 4.42 4Z',
    );
  });

  test('geometry snapshot pins the emission format', () => {
    const { isDark, n } = grid(['##.', '.#.', '.##']);
    expect(blobPath(isDark, n, 0)).toBe(
      'M0.42 0H1V1H0.42A0.42 0.42 0 0 1 0 0.58V0.42A0.42 0.42 0 0 1 0.42 0Z' +
        'M1 0H1.58A0.42 0.42 0 0 1 2 0.42V1H1V0Z' +
        'M1 1H2V2H1V1Z' +
        'M1 2H2V3H1.42A0.42 0.42 0 0 1 1 2.58V2Z' +
        'M2 2H2.58A0.42 0.42 0 0 1 3 2.42V2.58A0.42 0.42 0 0 1 2.58 3H2V2Z',
    );
  });
});
