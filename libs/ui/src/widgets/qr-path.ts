// Blob-merged QR module geometry. QR readers binarize a raster and sample
// module *centers*, so dark modules don't have to render as independent
// squares — adjacent ones can fuse into pills and blobs as long as every
// dark center stays dark and every light module stays untouched. This
// builder does exactly that, and nothing else: it never draws outside the
// dark modules' own unit squares.

/**
 * One SVG path `d` string covering every dark module.
 *
 * Each dark module contributes a unit-square subpath whose corners are
 * rounded only where the blob actually ends: a corner rounds iff both
 * orthogonal neighbors touching it AND the diagonal behind it are light.
 * Shared edges therefore stay square (runs fuse into seamless pills), and
 * diagonally-touching modules keep their meeting corners square so blobs
 * stay corner-connected instead of pinching apart.
 *
 * `radius` = 0.42 keeps the full center cross of even an isolated module
 * dark — the part center-sampling decoders actually read.
 */
export function blobPath(
  isDark: (r: number, c: number) => boolean,
  n: number,
  offset: number,
  radius = 0.42,
): string {
  const dark = (r: number, c: number): boolean =>
    r >= 0 && c >= 0 && r < n && c < n && isDark(r, c);
  const fmt = (v: number): string => String(parseFloat(v.toFixed(2)));
  const rr = fmt(radius);

  const subpaths: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue;
      const up = dark(r - 1, c);
      const down = dark(r + 1, c);
      const left = dark(r, c - 1);
      const right = dark(r, c + 1);
      const tl = !up && !left && !dark(r - 1, c - 1);
      const tr = !up && !right && !dark(r - 1, c + 1);
      const br = !down && !right && !dark(r + 1, c + 1);
      const bl = !down && !left && !dark(r + 1, c - 1);
      const x = c + offset;
      const y = r + offset;
      const p: string[] = [`M${fmt(x + (tl ? radius : 0))} ${fmt(y)}`];
      p.push(`H${fmt(x + 1 - (tr ? radius : 0))}`);
      if (tr) p.push(`A${rr} ${rr} 0 0 1 ${fmt(x + 1)} ${fmt(y + radius)}`);
      p.push(`V${fmt(y + 1 - (br ? radius : 0))}`);
      if (br) p.push(`A${rr} ${rr} 0 0 1 ${fmt(x + 1 - radius)} ${fmt(y + 1)}`);
      p.push(`H${fmt(x + (bl ? radius : 0))}`);
      if (bl) p.push(`A${rr} ${rr} 0 0 1 ${fmt(x)} ${fmt(y + 1 - radius)}`);
      p.push(`V${fmt(y + (tl ? radius : 0))}`);
      if (tl) p.push(`A${rr} ${rr} 0 0 1 ${fmt(x + radius)} ${fmt(y)}`);
      p.push('Z');
      subpaths.push(p.join(''));
    }
  }
  return subpaths.join('');
}
