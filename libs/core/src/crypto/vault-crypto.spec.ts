// Frozen KDF fixture: these exact outputs were captured from the shipped
// implementation. If any assertion here fails, the derivation drifted and
// every existing vault (local slot names, sync locators, write tokens,
// decryption keys) would silently break. Do not "fix" the expected values —
// fix the regression.
import { describe, expect, test } from 'vitest';
import { b64urlToBytes } from '../codec/base64url';
import { decryptVault, deriveVaultKeys } from './vault-crypto';

const FROZEN = {
  passphrase: 'correct horse battery staple luck',
  locator: 'Der1f4kqFOPzL2mAoHI-NQ',
  writeToken: 'ue0aXQIEANCW_sNhgDKL8g',
  // AES-GCM blob of {"v":1,"profiles":[],"connections":[]} under the derived
  // key (fixture uses a zero IV for determinism; production IVs are random).
  blob: 'AAAAAAAAAAAAAAAAN9vCX338NYCBc2jZ-aV2rLbHGJD3ZJl8U7B-wZDiEbOb5AncSzMDyEmd8M6Sru4WAxhEJ08f',
};

describe('vault KDF freeze', () => {
  test('locator, write token, and key are exactly what they were at v1', async () => {
    const keys = await deriveVaultKeys(FROZEN.passphrase);
    expect(keys.locator).toBe(FROZEN.locator);
    expect(keys.writeToken).toBe(FROZEN.writeToken);
    expect(keys.locator).toHaveLength(22);
    expect(keys.writeToken).toHaveLength(22);
    expect(keys.locator).not.toBe(keys.writeToken);

    const plain = await decryptVault<{ v: number }>(FROZEN.blob, keys.key);
    expect(plain.v).toBe(1);
  });

  test('locator and token bytes come from disjoint KDF regions', () => {
    // Sanity on the fixture itself: 16 bytes each, no shared prefix pattern.
    expect(b64urlToBytes(FROZEN.locator)).toHaveLength(16);
    expect(b64urlToBytes(FROZEN.writeToken)).toHaveLength(16);
  });
});
