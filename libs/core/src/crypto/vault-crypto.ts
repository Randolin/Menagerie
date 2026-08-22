// Vault crypto: passphrase → { locator, AES-GCM key }.
//
// The locator names the storage slot; the key encrypts its contents. Both
// come from one PBKDF2-SHA-512 derivation so neither is cheaper to
// brute-force than the other. The salt is a fixed app constant because the
// vault must be findable from the passphrase alone — the passphrase's own
// entropy (5 diceware words ≈ 65 bits) is what carries the security.
//
// This is real cryptography (unlike the match-token curtain): AES-256-GCM
// with no server, no recovery. Losing the passphrase loses the vault.
import { bytesToB64url, b64urlToBytes } from '../codec/base64url';
import { randomBytes } from './random';

const subtle = globalThis.crypto.subtle;

const VAULT_KDF_SALT = 'moxy.vault.v1';
export const VAULT_KDF_ITERATIONS = 300_000;

export interface VaultKeys {
  readonly locator: string;
  readonly key: CryptoKey;
}

export function normalizePassphrase(pass: string): string {
  return pass.trim().toLowerCase().split(/[\s-]+/).join(' ');
}

export async function deriveVaultKeys(passphrase: string): Promise<VaultKeys> {
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
      salt: new TextEncoder().encode(VAULT_KDF_SALT),
      iterations: VAULT_KDF_ITERATIONS,
    },
    material,
    512,
  );
  const bytes = new Uint8Array(bits);
  const locator = bytesToB64url(bytes.slice(0, 16));
  const key = await subtle.importKey(
    'raw',
    bytes.slice(16, 48),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  return { locator, key };
}

export async function encryptVault(obj: unknown, key: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64url(out);
}

export async function decryptVault<T>(b64: string, key: CryptoKey): Promise<T> {
  const bytes = b64urlToBytes(b64);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
