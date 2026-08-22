// Vault storage on Node's built-in SQLite. One table, opaque values: the
// server can never decrypt what it stores, and row timestamps are rounded to
// the hour so even edit-timing metadata stays coarse.
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';

export interface StoredVault {
  blob: string;
  version: number;
}

export type PutResult =
  | { status: 'created' | 'updated'; version: number }
  | { status: 'conflict'; version: number; blob: string }
  | { status: 'bad_token' }
  | { status: 'not_found' };

export type DeleteResult = 'deleted' | 'bad_token' | 'not_found';

function coarseNow(): number {
  const HOUR = 3_600_000;
  return Math.floor(Date.now() / HOUR) * HOUR;
}

function tokenMatches(storedHex: string, presentedHex: string): boolean {
  const a = Buffer.from(storedHex, 'hex');
  const b = Buffer.from(presentedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class VaultDb {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS vaults (
        locator    TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        blob       TEXT NOT NULL,
        version    INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
    `);
  }

  get(locator: string): StoredVault | null {
    const row = this.db
      .prepare('SELECT blob, version FROM vaults WHERE locator = ?')
      .get(locator) as { blob: string; version: number } | undefined;
    return row ? { blob: row.blob, version: row.version } : null;
  }

  /**
   * Compare-and-swap put. `ifVersion` 0 creates (registering the token
   * hash); otherwise the update requires the stored token hash to match
   * (constant-time compare in JS, never string comparison in SQL) and the
   * version to be current.
   */
  put(locator: string, tokenHashHex: string, blob: string, ifVersion: number): PutResult {
    const now = coarseNow();
    const row = this.db
      .prepare('SELECT token_hash, blob, version FROM vaults WHERE locator = ?')
      .get(locator) as { token_hash: string; blob: string; version: number } | undefined;

    if (!row) {
      if (ifVersion !== 0) return { status: 'not_found' };
      const ins = this.db
        .prepare(
          `INSERT INTO vaults (locator, token_hash, blob, version, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(locator) DO NOTHING`,
        )
        .run(locator, tokenHashHex, blob, now, now);
      if (ins.changes === 1) return { status: 'created', version: 1 };
      // Lost a create race (single-threaded, so only across requests): re-dispatch.
      return this.put(locator, tokenHashHex, blob, ifVersion);
    }

    if (!tokenMatches(row.token_hash, tokenHashHex)) return { status: 'bad_token' };
    if (row.version !== ifVersion) {
      return { status: 'conflict', version: row.version, blob: row.blob };
    }
    const upd = this.db
      .prepare('UPDATE vaults SET blob = ?, version = version + 1, updated_at = ? WHERE locator = ? AND version = ?')
      .run(blob, now, locator, ifVersion);
    if (upd.changes === 1) return { status: 'updated', version: ifVersion + 1 };
    // Version moved between SELECT and UPDATE (not possible single-threaded,
    // kept for safety): report the fresh state.
    const fresh = this.get(locator);
    return fresh
      ? { status: 'conflict', version: fresh.version, blob: fresh.blob }
      : { status: 'not_found' };
  }

  delete(locator: string, tokenHashHex: string): DeleteResult {
    const row = this.db
      .prepare('SELECT token_hash FROM vaults WHERE locator = ?')
      .get(locator) as { token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.token_hash, tokenHashHex)) return 'bad_token';
    this.db.prepare('DELETE FROM vaults WHERE locator = ?').run(locator);
    return 'deleted';
  }

  close(): void {
    this.db.close();
  }
}
