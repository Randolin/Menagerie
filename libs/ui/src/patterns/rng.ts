// Deterministic PRNG for banner geometry.
//
// mulberry32: 32-bit state, one multiply-xorshift round. Chosen because it is
// tiny, dependency-free and — critically — REPRODUCIBLE: the same seed must
// give the same banner on every device and every reload, or the pattern stops
// being something a person can recognise as theirs.
//
// Not cryptographic, and it must never be used as if it were. Its only input
// is the head-derived seed, which is public information already.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function range(rnd: () => number, min: number, max: number): number {
  return min + rnd() * (max - min);
}

/** Round to `places` decimals — keeps generated path data compact. */
export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
