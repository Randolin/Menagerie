// The vault's plaintext data schema, versioned independently of the blob
// envelope (which is unchanged since v1 — same localStorage keys, same
// AES-GCM framing). v2 adds tombstones (so deletions can't resurrect during
// sync merges), per-connection updatedAt (notes edits need last-write-wins),
// and the sync enrollment flag — which lives INSIDE the ciphertext, so the
// server never learns which vaults consider themselves sync-enabled.
import type { Answers } from '../schema/types';

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
  updatedAt: number; // v2; migrated from addedAt
}

export interface Tombstone {
  id: string;
  deletedAt: number;
}

export interface VaultSyncState {
  enabled: boolean;
  enabledAt: number;
}

export interface VaultData {
  v: 2;
  profiles: VaultProfile[];
  connections: VaultConnection[];
  tombstones: Tombstone[];
  sync?: VaultSyncState;
}

export function emptyVault(): VaultData {
  return { v: 2, profiles: [], connections: [], tombstones: [] };
}

interface VaultDataV1 {
  v: 1;
  profiles: VaultProfile[];
  connections: (Omit<VaultConnection, 'updatedAt'> & { updatedAt?: number })[];
}

/** Upgrade any known on-disk shape to the current one. Old exports stay importable. */
export function migrateVaultData(raw: unknown): VaultData {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Malformed vault data.');
  }
  const data = raw as { v?: number };
  if (data.v === 2) return raw as VaultData;
  if (data.v === 1) {
    const v1 = raw as VaultDataV1;
    return {
      v: 2,
      profiles: v1.profiles ?? [],
      connections: (v1.connections ?? []).map((c) => ({
        ...c,
        updatedAt: c.updatedAt ?? c.addedAt,
      })),
      tombstones: [],
    };
  }
  throw new Error(`Unknown vault data version (v${String(data.v)}).`);
}
