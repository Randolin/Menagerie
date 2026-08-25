// A real Voronoi diagram, not jittered triangles dressed up as one.
//
// Method: for each site, start from the bounding rectangle and clip it by the
// perpendicular bisector between that site and every other site. What survives
// is exactly that site's Voronoi cell — this is the textbook half-plane
// intersection definition, computed directly.
//
// O(n²) in the number of sites, which is the right trade here: banners use
// ~10–40 sites, so that is at most a few hundred polygon clips of a shape with
// a handful of vertices. Fortune's sweepline would be asymptotically better and
// several hundred lines longer, for input sizes where it would lose on
// constants anyway.
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Sutherland–Hodgman clip of a convex polygon against the half-plane
 * `dot(n, p) <= c`. The polygon stays convex, so the result is either a convex
 * polygon or empty.
 */
function clipHalfPlane(poly: Point[], nx: number, ny: number, c: number): Point[] {
  const out: Point[] = [];
  const eps = 1e-9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a.x + ny * a.y - c;
    const db = nx * b.x + ny * b.y - c;
    const aIn = da <= eps;
    const bIn = db <= eps;
    if (aIn) out.push(a);
    // Crossing the boundary: add the intersection point.
    if (aIn !== bIn) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * Voronoi cells for `sites`, clipped to the rectangle (0,0)–(width,height).
 * Returns one polygon per site, in the same order; a degenerate cell (from
 * duplicate sites) comes back as an empty array and should be skipped.
 */
export function voronoiCells(
  sites: readonly Point[],
  width: number,
  height: number,
): Point[][] {
  return sites.map((site) => {
    let cell: Point[] = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
    for (const other of sites) {
      if (other === site) continue;
      const dx = other.x - site.x;
      const dy = other.y - site.y;
      if (dx === 0 && dy === 0) continue;
      // Points closer to `site` than to `other` satisfy
      //   dot((other-site), p) <= dot((other-site), midpoint)
      const midX = (site.x + other.x) / 2;
      const midY = (site.y + other.y) / 2;
      cell = clipHalfPlane(cell, dx, dy, dx * midX + dy * midY);
      if (cell.length === 0) break;
    }
    return cell;
  });
}

/** Move a polygon's vertices toward its centroid, opening gaps between cells. */
export function shrinkPolygon(poly: readonly Point[], factor: number): Point[] {
  if (poly.length === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  return poly.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  }));
}
