import { describe, expect, test } from 'vitest';
import { emptyVault, migrateVaultData, type VaultData } from './vault-data';
import { canonicalVaultJson, mergeVaultData, TOMBSTONE_TTL_MS } from './vault-merge';

const NOW = 1_700_000_000_000;

function conn(id: string, label: string, updatedAt: number, notes = '') {
  return { id, label, code: `m1.${id}`, notes, addedAt: updatedAt - 1000, updatedAt };
}

function vault(partial: Partial<VaultData>): VaultData {
  return { ...emptyVault(), ...partial };
}

describe('mergeVaultData', () => {
  test('union of disjoint items, commutatively', () => {
    const a = vault({ connections: [conn('x', 'Casey', NOW - 50)] });
    const b = vault({ connections: [conn('y', 'Drew', NOW - 40)] });
    const ab = mergeVaultData(a, b, NOW);
    const ba = mergeVaultData(b, a, NOW);
    expect(ab.connections.map((c) => c.label)).toEqual(['Casey', 'Drew']);
    expect(canonicalVaultJson(ab)).toBe(canonicalVaultJson(ba));
  });

  test('same id: newer updatedAt wins; equal timestamps converge deterministically', () => {
    const older = conn('x', 'Old notes', NOW - 100, 'old');
    const newer = conn('x', 'New notes', NOW - 10, 'new');
    expect(mergeVaultData(vault({ connections: [older] }), vault({ connections: [newer] }), NOW)
      .connections[0].notes).toBe('new');

    const tieA = conn('x', 'A', NOW - 10);
    const tieB = conn('x', 'B', NOW - 10);
    const r1 = mergeVaultData(vault({ connections: [tieA] }), vault({ connections: [tieB] }), NOW);
    const r2 = mergeVaultData(vault({ connections: [tieB] }), vault({ connections: [tieA] }), NOW);
    expect(canonicalVaultJson(r1)).toBe(canonicalVaultJson(r2));
  });

  test('tombstone deletes across devices and does not resurrect', () => {
    const a = vault({ tombstones: [{ id: 'x', deletedAt: NOW - 10 }] });
    const b = vault({ connections: [conn('x', 'Drew', NOW - 50)] });
    const merged = mergeVaultData(a, b, NOW);
    expect(merged.connections).toEqual([]);
    expect(merged.tombstones.map((t) => t.id)).toEqual(['x']);
    // Merging again with a stale copy still yields deletion.
    const again = mergeVaultData(merged, b, NOW);
    expect(again.connections).toEqual([]);
  });

  test('an edit AFTER the deletion resurrects the item and drops the tombstone', () => {
    const deleted = vault({ tombstones: [{ id: 'x', deletedAt: NOW - 50 }] });
    const editedLater = vault({ connections: [conn('x', 'Drew edited', NOW - 10)] });
    const merged = mergeVaultData(deleted, editedLater, NOW);
    expect(merged.connections.map((c) => c.label)).toEqual(['Drew edited']);
    expect(merged.tombstones).toEqual([]);
  });

  test('tombstones are GCed past the TTL', () => {
    const a = vault({ tombstones: [{ id: 'x', deletedAt: NOW - TOMBSTONE_TTL_MS - 1 }] });
    expect(mergeVaultData(a, emptyVault(), NOW).tombstones).toEqual([]);
  });

  test('sync flag: newer enabledAt wins; enabled wins ties', () => {
    const on = vault({ sync: { enabled: true, enabledAt: NOW - 10 } });
    const off = vault({ sync: { enabled: false, enabledAt: NOW - 50 } });
    expect(mergeVaultData(on, off, NOW).sync?.enabled).toBe(true);
    const offTie = vault({ sync: { enabled: false, enabledAt: NOW - 10 } });
    expect(mergeVaultData(on, offTie, NOW).sync?.enabled).toBe(true);
  });
});

describe('migrateVaultData', () => {
  test('v1 gains tombstones and per-connection updatedAt', () => {
    const v1 = {
      v: 1,
      profiles: [{ id: 'p', label: 'Me', answers: {}, createdAt: 1, updatedAt: 2 }],
      connections: [{ id: 'c', label: 'Alex', code: 'm1.a', notes: '', addedAt: 5 }],
    };
    const out = migrateVaultData(v1);
    expect(out.v).toBe(2);
    expect(out.tombstones).toEqual([]);
    expect(out.connections[0].updatedAt).toBe(5);
    expect(out.profiles).toHaveLength(1);
  });

  test('v2 passes through; unknown versions throw', () => {
    const v2 = emptyVault();
    expect(migrateVaultData(v2)).toBe(v2);
    expect(() => migrateVaultData({ v: 99 })).toThrow(/Unknown vault data version/);
  });
});
