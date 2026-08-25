// The one passphrase KDF: phrase → { locator, AES-GCM key, bearer token }.
//
// Argon2id (memory-hard: 64 MiB × 3 passes) — chosen over PBKDF2 because the
// view phrase's secret tail is 36 bits of curated-list words, and memory
// hardness is what makes each attacker guess expensive on GPUs. One
// derivation yields all three outputs from disjoint slices, so none is
// cheaper to brute-force than another. The salt is a fixed domain constant
// because the record must be findable from the phrase alone — the phrase's
// entropy carries the security. Distinct domain salts (hatch view vs. edit)
// guarantee the same phrase used in different roles can never collide.
//
// This is real cryptography (unlike the match-token curtain): AES-256-GCM
// with no server-side recovery. Losing the phrase loses the data.
import { argon2id } from 'hash-wasm';
import { bytesToB64url } from '../codec/base64url';

export const PHRASE_KDF_PARAMS = {
  memorySizeKiB: 65536,
  iterations: 3,
  parallelism: 1,
} as const;

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
  const bytes = await argon2id({
    password: normalizePassphrase(passphrase),
    salt: new TextEncoder().encode(domainSalt),
    memorySize: PHRASE_KDF_PARAMS.memorySizeKiB,
    iterations: PHRASE_KDF_PARAMS.iterations,
    parallelism: PHRASE_KDF_PARAMS.parallelism,
    hashLength: 64,
    outputType: 'binary',
  });
  const key = await globalThis.crypto.subtle.importKey(
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
