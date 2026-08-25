// Helpers shared by the SQLite stores. The hour-coarse clock is a privacy
// invariant (timestamps never reveal more than the hour; GC cutoffs depend
// on it), so it lives in exactly one place.
import { timingSafeEqual } from 'node:crypto';

export const HOUR = 3_600_000;

/** Now, floored to the hour — the only clock the stores ever persist. */
export function coarseNow(now = Date.now()): number {
  return Math.floor(now / HOUR) * HOUR;
}

/** Constant-time comparison of two hex token hashes. */
export function tokenMatches(storedHex: string, presentedHex: string): boolean {
  const a = Buffer.from(storedHex, 'hex');
  const b = Buffer.from(presentedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
