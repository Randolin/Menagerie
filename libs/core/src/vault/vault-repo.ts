// The passphrase vault, as a STATELESS repository: every method takes or
// returns explicit state; session lifetime (holding the CryptoKey in memory)
// is the caller's concern (the app's VaultStore). Storage keys and blob
// formats are unchanged from the legacy app so existing vaults keep working.
import type { Answers } from '../schema/types';
import type { StorageLike } from '../storage/storage';
import {
  deriveVaultKeys,
  encryptVault,
  decryptVault,
} from '../crypto/vault-crypto';

const VAULT_PREFIX = 'moxy.vault.v1.'; // unchanged from the legacy app

export interface VaultProfile {
  id: string;
  label: string;
  answers: Answers;
  createdAt: number;
  updatedAt: number;
}

export interface VaultConnection {
  id: string;
  label: string;
  code: string;
  notes: string;
  addedAt: number;
}

export interface VaultData {
  v: 1;
  profiles: VaultProfile[];
  connections: VaultConnection[];
}

export interface VaultSession {
  readonly locator: string;
  readonly key: CryptoKey;
  readonly data: VaultData;
}

interface VaultExport {
  moxyVault: 1;
  locator: string;
  data: string;
}

function emptyVault(): VaultData {
  return { v: 1, profiles: [], connections: [] };
}

export class VaultRepository {
  constructor(private readonly storage: StorageLike) {}

  /**
   * Open (or create) the vault reachable from this passphrase. Returns null
   * when no vault exists and creation wasn't requested — a wrong passphrase
   * is indistinguishable from "no vault", by design.
   */
  async open(
    passphrase: string,
    opts: { createIfMissing?: boolean } = {},
  ): Promise<VaultSession | null> {
    const { locator, key } = await deriveVaultKeys(passphrase);
    const slot = VAULT_PREFIX + locator;
    const stored = this.storage.getItem(slot);
    let data: VaultData;
    if (stored === null) {
      if (!opts.createIfMissing) return null;
      data = emptyVault();
    } else {
      try {
        data = await decryptVault<VaultData>(stored, key);
      } catch {
        // A locator collision without a matching key is cryptographically
        // implausible; treat any failure as corrupt storage.
        throw new Error(
          'That vault exists but could not be decrypted — storage may be corrupted.',
        );
      }
    }
    const session: VaultSession = { locator, key, data };
    if (stored === null) await this.persist(session);
    return session;
  }

  async persist(session: VaultSession): Promise<void> {
    const blob = await encryptVault(session.data, session.key);
    this.storage.setItem(VAULT_PREFIX + session.locator, blob);
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
    const { locator, key } = await deriveVaultKeys(passphrase);
    if (locator !== parsed.locator) {
      throw new Error('That passphrase does not match this vault export.');
    }
    await decryptVault<VaultData>(parsed.data, key); // verify before storing
    this.storage.setItem(VAULT_PREFIX + parsed.locator, parsed.data);
    const session = await this.open(passphrase);
    if (!session) throw new Error('Import succeeded but the vault could not be reopened.');
    return session;
  }
}
