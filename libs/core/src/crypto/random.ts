import { bytesToB64url } from '../codec/base64url';

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function randomSalt(): string {
  return bytesToB64url(randomBytes(9)); // 12 chars
}

/**
 * Uniform random index in [0, n) for any n ≤ 65536, via rejection sampling —
 * no modulo bias regardless of list size.
 */
export function randomIndex(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 65536) {
    throw new Error(`randomIndex: n out of range (${n})`);
  }
  const limit = Math.floor(65536 / n) * n;
  for (;;) {
    const b = randomBytes(2);
    const v = (b[0] << 8) | b[1];
    if (v < limit) return v % n;
  }
}
