// Hatch profile storage (v2). One row per profile: two opaque ciphertext
// blobs addressed by two independent locators, a version counter, and
// hour-coarse lifecycle timestamps for garbage collection. The server can
// never decrypt anything it stores.
import { DatabaseSync } from 'node:sqlite';
import { HOUR, coarseNow, tokenMatches } from './db-util.ts';

export interface ProfileViewRow {
  blob_view: string;
  version: number;
}

export interface ProfileEditRow {
  blob_view: string;
  blob_priv: string;
  version: number;
  populated: boolean;
}

export type CreateResult = 'created' | 'locator_taken';

export interface PutInput {
  blob_view: string;
  blob_priv: string;
  populated: boolean;
  newViewLocator?: string;
  newEditLocator?: string;
  newEditTokenHash?: string;
}

export type PutResult =
  | { status: 'updated'; version: number }
  | { status: 'conflict'; version: number; blob_view: string; blob_priv: string }
  | { status: 'bad_token' }
  | { status: 'not_found' }
  | { status: 'locator_taken' };

export type DeleteResult = 'deleted' | 'bad_token' | 'not_found';

export class ProfilesDb {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS profiles (
        view_locator    TEXT PRIMARY KEY,
        edit_locator    TEXT NOT NULL UNIQUE,
        edit_token_hash TEXT NOT NULL,
        blob_view       TEXT NOT NULL,
        blob_priv       TEXT NOT NULL,
        version         INTEGER NOT NULL,
        populated       INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        last_viewed_at  INTEGER
      ) STRICT;
    `);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number };
    return row.n;
  }

  create(
    viewLocator: string,
    editLocator: string,
    editTokenHash: string,
    blobView: string,
    blobPriv: string,
  ): CreateResult {
    const now = coarseNow();
    const result = this.db
      .prepare(
        `INSERT INTO profiles
           (view_locator, edit_locator, edit_token_hash, blob_view, blob_priv,
            version, populated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(viewLocator, editLocator, editTokenHash, blobView, blobPriv, now, now);
    return result.changes === 1 ? 'created' : 'locator_taken';
  }

  /** Read by view locator; bumps last_viewed_at (hour-coarse). */
  getView(viewLocator: string): ProfileViewRow | null {
    const row = this.db
      .prepare('SELECT blob_view, version FROM profiles WHERE view_locator = ?')
      .get(viewLocator) as { blob_view: string; version: number } | undefined;
    if (!row) return null;
    this.db
      .prepare('UPDATE profiles SET last_viewed_at = ? WHERE view_locator = ?')
      .run(coarseNow(), viewLocator);
    return { blob_view: row.blob_view, version: row.version };
  }

  getEdit(editLocator: string): ProfileEditRow | null {
    const row = this.db
      .prepare(
        'SELECT blob_view, blob_priv, version, populated FROM profiles WHERE edit_locator = ?',
      )
      .get(editLocator) as
      { blob_view: string; blob_priv: string; version: number; populated: number } | undefined;
    if (!row) return null;
    return {
      blob_view: row.blob_view,
      blob_priv: row.blob_priv,
      version: row.version,
      populated: row.populated === 1,
    };
  }

  /**
   * Compare-and-swap update, optionally re-keying either identity — a single
   * UPDATE statement, atomic under node:sqlite's synchronous single-threaded
   * execution. Token compared constant-time in JS, never in SQL.
   */
  put(editLocator: string, tokenHashHex: string, ifVersion: number, input: PutInput): PutResult {
    const row = this.db
      .prepare(
        'SELECT view_locator, edit_token_hash, blob_view, blob_priv, version, populated FROM profiles WHERE edit_locator = ?',
      )
      .get(editLocator) as
      | {
          view_locator: string;
          edit_token_hash: string;
          blob_view: string;
          blob_priv: string;
          version: number;
          populated: number;
        }
      | undefined;
    if (!row) return { status: 'not_found' };
    if (!tokenMatches(row.edit_token_hash, tokenHashHex)) return { status: 'bad_token' };
    if (row.version !== ifVersion) {
      return {
        status: 'conflict',
        version: row.version,
        blob_view: row.blob_view,
        blob_priv: row.blob_priv,
      };
    }

    const nextView = input.newViewLocator ?? row.view_locator;
    const nextEdit = input.newEditLocator ?? editLocator;
    const nextTokenHash = input.newEditTokenHash ?? row.edit_token_hash;
    const populated = row.populated === 1 || input.populated ? 1 : 0;
    try {
      const result = this.db
        .prepare(
          `UPDATE profiles
             SET view_locator = ?, edit_locator = ?, edit_token_hash = ?,
                 blob_view = ?, blob_priv = ?, version = version + 1,
                 populated = ?, updated_at = ?
           WHERE edit_locator = ? AND version = ?`,
        )
        .run(
          nextView,
          nextEdit,
          nextTokenHash,
          input.blob_view,
          input.blob_priv,
          populated,
          coarseNow(),
          editLocator,
          ifVersion,
        );
      if (result.changes === 1) return { status: 'updated', version: ifVersion + 1 };
      return { status: 'not_found' };
    } catch (err) {
      // UNIQUE/PK violation: the requested new locator already names a row.
      if (String(err).includes('constraint')) return { status: 'locator_taken' };
      throw err;
    }
  }

  delete(editLocator: string, tokenHashHex: string): DeleteResult {
    const row = this.db
      .prepare('SELECT edit_token_hash FROM profiles WHERE edit_locator = ?')
      .get(editLocator) as { edit_token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.edit_token_hash, tokenHashHex)) return 'bad_token';
    this.db.prepare('DELETE FROM profiles WHERE edit_locator = ?').run(editLocator);
    return 'deleted';
  }

  /**
   * GC sweep. Returns rows removed (observability for tests without logging).
   * Timestamps are hour-coarse (floored), overstating a row's age by up to an
   * hour — so the cutoffs grant that hour back, making every TTL a guaranteed
   * MINIMUM lifetime: nothing dies before ttl, at the price of living up to
   * an hour longer.
   */
  sweep(emptyTtlMs: number, idleTtlMs: number, now = Date.now()): number {
    const emptyCutoff = now - emptyTtlMs - HOUR;
    const idleCutoff = now - idleTtlMs - HOUR;
    const empty = this.db
      .prepare('DELETE FROM profiles WHERE populated = 0 AND created_at < ?')
      .run(emptyCutoff);
    const idle = this.db
      .prepare(
        `DELETE FROM profiles
          WHERE populated = 1 AND updated_at < ?
            AND (last_viewed_at IS NULL OR last_viewed_at < ?)`,
      )
      .run(idleCutoff, idleCutoff);
    return Number(empty.changes) + Number(idle.changes);
  }

  close(): void {
    this.db.close();
  }
}
