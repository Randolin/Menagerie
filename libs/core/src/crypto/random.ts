import { bytesToB64url } from '../codec/base64url';

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function randomSalt(): string {
  return bytesToB64url(randomBytes(9)); // 12 chars
}
