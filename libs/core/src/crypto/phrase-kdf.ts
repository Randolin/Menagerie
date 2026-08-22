// The one passphrase KDF: phrase → { locator, AES-GCM key, bearer token }.
//
// A single PBKDF2-SHA-512 derivation (300k iterations) yields all three, so
// no output is cheaper to brute-force than another. The salt is a fixed
// domain constant because the record must be findable from the phrase alone —
// the phrase's own entropy is what carries the security. Distinct domain
// salts (hatch view vs. edit) guarantee the same phrase used in different
// roles can never collide across namespaces.
//
// This is real cryptography (unlike the match-token curtain): AES-256-GCM
// with no server-side recovery. Losing the phrase loses the data.
import { bytesToB64url } from '../codec/base64url';

const subtle = globalThis.crypto.subtle;

export const PHRASE_KDF_ITERATIONS = 300_000;

export interface PhraseKeys {
  /** b64url of KDF bytes 0..16 — names the storage slot. 22 chars. */
  readonly locator: string;
  /** AES-256-GCM key from KDF bytes 16..48. */
  readonly key: CryptoKey;
  /** b64url of KDF bytes 48..64 — bearer token; servers store only its SHA-256. */
  readonly token: string;
}

export function normalizePassphrase(pass: string): string {
  return pass.trim().toLowerCase().split(/[\s-]+/).join(' ');
}

export async function derivePhraseKeys(
  passphrase: string,
  domainSalt: string,
): Promise<PhraseKeys> {
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt: new TextEncoder().encode(domainSalt),
      iterations: PHRASE_KDF_ITERATIONS,
    },
    material,
    512,
  );
  const bytes = new Uint8Array(bits);
  const key = await subtle.importKey(
    'raw',
    bytes.slice(16, 48),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  return {
    locator: bytesToB64url(bytes.slice(0, 16)),
    key,
    token: bytesToB64url(bytes.slice(48, 64)),
  };
}
