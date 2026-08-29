// Frozen KDF fixture (v2, Argon2id): these exact outputs were captured from
// the shipped implementation. The domain below is a fixture value, chosen to
// be none of the production constants in crypto/domains.ts — this spec pins
// the ALGORITHM, and stays green when a new derivation is added. If any assertion fails, the derivation drifted
// and every existing profile's locators, tokens, and keys would silently
// break. Do not "fix" the expected values — fix the regression.
import { describe, expect, test } from 'vitest';
import { b64urlToBytes, bytesToB64url } from '../codec/base64url';
import { derivePhraseKeys, normalizePassphrase, PHRASE_KDF_PARAMS } from './phrase-kdf';

const FROZEN = {
  passphrase: 'correct horse battery staple luck',
  domain: 'kdf-vector-fixture',
  locator: 'bC8TOyWgo2bAWmnxgkeY7w',
  token: 'loPjY2gL-XkEsMPy8xnbYQ',
  // AES-GCM of 'menagerie-kdf-pin' under the derived key (fixture uses a
  // zero IV for determinism; production IVs are random). Pins the key slice.
  pin: 'L-ecC08oi6AFzmFzY23-kBdcjKAIlgMlEiaB7MDjgq2N',
};

describe('phrase KDF v2 freeze (Argon2id)', () => {
  test('parameters are the frozen cost profile', () => {
    expect(PHRASE_KDF_PARAMS).toEqual({ memorySizeKiB: 65536, iterations: 3, parallelism: 1 });
  });

  test('locator, token, and key are exactly what they were at v2', async () => {
    const keys = await derivePhraseKeys(FROZEN.passphrase, FROZEN.domain);
    expect(keys.locator).toBe(FROZEN.locator);
    expect(keys.token).toBe(FROZEN.token);
    expect(keys.locator).toHaveLength(22);
    expect(keys.token).toHaveLength(22);
    expect(keys.locator).not.toBe(keys.token);

    const iv = new Uint8Array(12);
    const ct = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        keys.key,
        new TextEncoder().encode('menagerie-kdf-pin'),
      ),
    );
    expect(bytesToB64url(ct)).toBe(FROZEN.pin);
  }, 30000);

  test('locator and token bytes come from disjoint KDF regions', () => {
    expect(b64urlToBytes(FROZEN.locator)).toHaveLength(16);
    expect(b64urlToBytes(FROZEN.token)).toHaveLength(16);
  });

  test('normalization: case, hyphens, and padding collapse identically', async () => {
    expect(normalizePassphrase('  Correct-Horse battery  STAPLE luck ')).toBe(FROZEN.passphrase);
    const derived = await derivePhraseKeys('Correct-Horse-Battery-Staple-Luck', FROZEN.domain);
    expect(derived.locator).toBe(FROZEN.locator);
  }, 30000);
});
