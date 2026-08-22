// Two-device vault merge. Symmetric and order-independent: every rule
// depends only on the pair of inputs, never on which side is "local", so
// both devices converge to the same result whichever pushes first.
import type { Tombstone, VaultConnection, VaultData, VaultProfile } from './vault-data';

export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

interface Stamped {
  id: string;
  updatedAt: number;
}

// Same id on both sides: greater updatedAt wins; equal timestamps break the
// tie by lexicographic JSON compare — arbitrary, but symmetric, so both
// devices deterministically pick the same winner.
function pickNewer<T extends Stamped>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeItems<T extends Stamped>(
  a: readonly T[],
  b: readonly T[],
  tombstones: ReadonlyMap<string, number>,
): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? pickNewer(existing, item) : item);
  }
  // A tombstone kills an item only if the deletion is at least as new as the
  // item's last edit; an item edited AFTER its deletion elsewhere survives
  // (edit-wins resurrection — the tombstone is dropped by the caller).
  return [...byId.values()].filter((item) => {
    const deletedAt = tombstones.get(item.id);
    return deletedAt === undefined || item.updatedAt > deletedAt;
  });
}

export function mergeVaultData(a: VaultData, b: VaultData, now = Date.now()): VaultData {
  // Tombstones: union by id keeping the newest deletion, GC'd at the TTL.
  // (Consequence, documented: a device offline longer than the TTL can
  // resurrect a deletion. Accepted trade for bounded growth.)
  const tombstoneMap = new Map<string, number>();
  for (const t of [...a.tombstones, ...b.tombstones]) {
    if (t.deletedAt < now - TOMBSTONE_TTL_MS) continue;
    const existing = tombstoneMap.get(t.id);
    if (existing === undefined || t.deletedAt > existing) tombstoneMap.set(t.id, t.deletedAt);
  }

  const profiles = mergeItems<VaultProfile>(a.profiles, b.profiles, tombstoneMap);
  const connections = mergeItems<VaultConnection>(a.connections, b.connections, tombstoneMap);

  // Drop tombstones that lost to a later edit, so the deletion doesn't
  // re-apply on the next merge.
  const liveIds = new Set([...profiles, ...connections].map((x) => x.id));
  const tombstones: Tombstone[] = [...tombstoneMap.entries()]
    .filter(([id]) => !liveIds.has(id))
    .map(([id, deletedAt]) => ({ id, deletedAt }));

  let sync = a.sync ?? b.sync;
  if (a.sync && b.sync) {
    if (a.sync.enabledAt !== b.sync.enabledAt) {
      sync = a.sync.enabledAt > b.sync.enabledAt ? a.sync : b.sync;
    } else {
      sync = a.sync.enabled ? a.sync : b.sync; // enabled wins ties
    }
  }

  const byCreation = <T extends { id: string }>(ts: (x: T) => number) => (x: T, y: T) =>
    ts(x) - ts(y) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

  const out: VaultData = {
    v: 2,
    profiles: profiles.sort(byCreation((p) => p.createdAt)),
    connections: connections.sort(byCreation((c) => c.addedAt)),
    tombstones: tombstones.sort(byCreation((t) => t.deletedAt)),
  };
  if (sync) out.sync = sync;
  return out;
}

/** Stable serialization for "did anything actually change" checks. */
export function canonicalVaultJson(d: VaultData): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([x], [y]) => (x < y ? -1 : 1))
          .map(([k, v]) => [k, sortKeys(v)]),
      );
    }
    return value;
  };
  return JSON.stringify(sortKeys(mergeVaultData(d, d)));
}
