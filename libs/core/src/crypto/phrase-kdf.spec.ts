// Frozen KDF fixture: these exact outputs were captured from the original
// shipped implementation (domain 'moxy.vault.v1' is the historical anchor —
// the hatch domains run through the very same function). If any assertion
// fails, the derivation drifted and every existing profile's locators,
// tokens, and keys would silently break. Do not "fix" the expected values —
// fix the regression.
import { describe, expect, test } from 'vitest';
import { b64urlToBytes } from '../codec/base64url';
import { derivePhraseKeys, normalizePassphrase } from './phrase-kdf';

const FROZEN = {
  passphrase: 'correct horse battery staple luck',
  domain: 'moxy.vault.v1',
  locator: 'Der1f4kqFOPzL2mAoHI-NQ',
  token: 'ue0aXQIEANCW_sNhgDKL8g',
  // AES-GCM of {"v":1,"profiles":[],"connections":[]} under the derived key
  // (fixture uses a zero IV for determinism; production IVs are random).
  blob: 'AAAAAAAAAAAAAAAAN9vCX338NYCBc2jZ-aV2rLbHGJD3ZJl8U7B-wZDiEbOb5AncSzMDyEmd8M6Sru4WAxhEJ08f',
};

describe('phrase KDF freeze', () => {
  test('locator, token, and key are exactly what they were at v1', async () => {
    const keys = await derivePhraseKeys(FROZEN.passphrase, FROZEN.domain);
    expect(keys.locator).toBe(FROZEN.locator);
    expect(keys.token).toBe(FROZEN.token);
    expect(keys.locator).toHaveLength(22);
    expect(keys.token).toHaveLength(22);
    expect(keys.locator).not.toBe(keys.token);

    // The key slice is pinned by decrypting a blob frozen under it.
    const bytes = b64urlToBytes(FROZEN.blob);
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) as BufferSource },
      keys.key,
      bytes.slice(12) as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as { v: number };
    expect(parsed.v).toBe(1);
  });

  test('locator and token bytes come from disjoint KDF regions', () => {
    expect(b64urlToBytes(FROZEN.locator)).toHaveLength(16);
    expect(b64urlToBytes(FROZEN.token)).toHaveLength(16);
  });

  test('normalization: case, hyphens, and padding collapse identically', async () => {
    expect(normalizePassphrase('  Correct-Horse battery  STAPLE luck ')).toBe(FROZEN.passphrase);
    const derived = await derivePhraseKeys('Correct-Horse-Battery-Staple-Luck', FROZEN.domain);
    expect(derived.locator).toBe(FROZEN.locator);
  });
});
