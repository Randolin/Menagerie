// The passphrase vault, as a STATELESS repository: every method takes or
// returns explicit state; session lifetime (holding the CryptoKey in memory)
// is the caller's concern (the app's VaultStore). Storage keys and blob
// formats are unchanged from the original app so existing vaults keep
// working; the plaintext schema migrates via vault-data.ts.
import type { StorageLike } from '../storage/storage';
import {
  deriveVaultKeys,
  encryptVault,
  decryptVault,
  type VaultKeys,
} from '../crypto/vault-crypto';
import { emptyVault, migrateVaultData, type VaultData } from './vault-data';

const VAULT_PREFIX = 'moxy.vault.v1.'; // unchanged from the legacy app

export interface VaultSession {
  readonly locator: string;
  readonly key: CryptoKey;
  readonly writeToken: string;
  readonly data: VaultData;
}

interface VaultExport {
  moxyVault: 1;
  locator: string;
  data: string;
}

export class VaultRepository {
  constructor(private readonly storage: StorageLike) {}

  /** Convenience wrapper: derive keys, then open. */
  async open(
    passphrase: string,
    opts: { createIfMissing?: boolean } = {},
  ): Promise<VaultSession | null> {
    return this.openWithKeys(await deriveVaultKeys(passphrase), opts);
  }

  /**
   * Open (or create) the vault these keys reach. Returns null when no vault
   * exists locally and creation wasn't requested — a wrong passphrase is
   * indistinguishable from "no vault", by design. Callers that also want a
   * remote fallback derive keys once and reuse them here (the 300k-iteration
   * KDF is paid exactly once per unlock).
   */
  async openWithKeys(
    keys: VaultKeys,
    opts: { createIfMissing?: boolean } = {},
  ): Promise<VaultSession | null> {
    const stored = this.storage.getItem(VAULT_PREFIX + keys.locator);
    let data: VaultData;
    if (stored === null) {
      if (!opts.createIfMissing) return null;
      data = emptyVault();
    } else {
      try {
        data = migrateVaultData(await decryptVault<unknown>(stored, keys.key));
      } catch {
        // A locator collision without a matching key is cryptographically
        // implausible; treat any failure as corrupt storage.
        throw new Error(
          'That vault exists but could not be decrypted — storage may be corrupted.',
        );
      }
    }
    const session: VaultSession = {
      locator: keys.locator,
      key: keys.key,
      writeToken: keys.writeToken,
      data,
    };
    if (stored === null) await this.persist(session);
    return session;
  }

  async persist(session: VaultSession): Promise<void> {
    const blob = await encryptVault(session.data, session.key);
    this.storage.setItem(VAULT_PREFIX + session.locator, blob);
  }

  /** The exact ciphertext at rest — what a sync client pushes. */
  currentBlob(locator: string): string | null {
    return this.storage.getItem(VAULT_PREFIX + locator);
  }

  /**
   * Store a blob fetched from a sync server. The caller MUST have decrypted
   * it successfully first — this method trusts that verification.
   */
  storeVerifiedBlob(locator: string, blob: string): void {
    this.storage.setItem(VAULT_PREFIX + locator, blob);
  }

  /** Remove a local slot (passphrase-change cleanup). */
  removeSlot(locator: string): void {
    this.storage.removeItem(VAULT_PREFIX + locator);
  }

  /** The encrypted blob for cross-device export — useless without the passphrase. */
  exportBlob(session: VaultSession): string {
    const blob = this.storage.getItem(VAULT_PREFIX + session.locator);
    const out: VaultExport = { moxyVault: 1, locator: session.locator, data: blob ?? '' };
    return JSON.stringify(out);
  }

  async importBlob(text: string, passphrase: string): Promise<VaultSession> {
    let parsed: VaultExport;
    try {
      parsed = JSON.parse(text) as VaultExport;
    } catch {
      throw new Error('That file is not a Moxy vault export.');
    }
    if (!parsed || parsed.moxyVault !== 1 || !parsed.locator || !parsed.data) {
      throw new Error('That file is not a Moxy vault export.');
    }
    const keys = await deriveVaultKeys(passphrase);
    if (keys.locator !== parsed.locator) {
      throw new Error('That passphrase does not match this vault export.');
    }
    await decryptVault<unknown>(parsed.data, keys.key); // verify before storing
    this.storage.setItem(VAULT_PREFIX + parsed.locator, parsed.data);
    const session = await this.openWithKeys(keys);
    if (!session) throw new Error('Import succeeded but the vault could not be reopened.');
    return session;
  }
}
