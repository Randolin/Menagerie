// Boop inbox storage (v1). An inbox is a locator, an owner token hash, and
// a pile of sealed knock blobs; the server can't read a knock, can't tell a
// first contact from a reply, and can't see who posted one. What it
// unavoidably learns: that an inbox exists, when knocks arrive (hour-coarse)
// and how many are pending — plus, when a sender registers a reply box and
// then knocks moments later from the same address, a timing correlation the
// client softens with jitter but the model cannot erase.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export type InboxCreateResult = 'created' | 'locator_taken';
export type KnockAddResult = 'added' | 'not_found' | 'full' | 'throttled';
export type KnockDeleteResult = 'deleted' | 'bad_token' | 'not_found';
export type InboxDeleteResult = 'deleted' | 'bad_token' | 'not_found';
export type InboxListResult =
  | { status: 'ok'; knocks: { id: string; blob: string; created: number }[] }
  | { status: 'bad_token' }
  | { status: 'not_found' };

const HOUR = 3_600_000;

function coarseNow(now = Date.now()): number {
  return Math.floor(now / HOUR) * HOUR;
}

function tokenMatches(storedHex: string, presentedHex: string): boolean {
  const a = Buffer.from(storedHex, 'hex');
  const b = Buffer.from(presentedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class BoopsDb {
  private readonly db: DatabaseSync;
  private readonly maxPending: number;
  private readonly knocksPerHour: number;
  private readonly knockTtlMs: number;

  constructor(path: string, maxPending: number, knocksPerHour: number, knockTtlMs: number) {
    this.maxPending = maxPending;
    this.knocksPerHour = knocksPerHour;
    this.knockTtlMs = knockTtlMs;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS boop_inboxes (
        inbox_locator  TEXT PRIMARY KEY,
        token_hash     TEXT NOT NULL,
        created_at     INTEGER NOT NULL,
        last_polled_at INTEGER
      ) STRICT;
      CREATE TABLE IF NOT EXISTS boop_knocks (
        knock_id      TEXT PRIMARY KEY,
        inbox_locator TEXT NOT NULL,
        blob          TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_knocks_inbox
        ON boop_knocks (inbox_locator);
    `);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM boop_inboxes').get() as { n: number };
    return row.n;
  }

  createInbox(locator: string, tokenHash: string): InboxCreateResult {
    const now = coarseNow();
    const result = this.db
      .prepare(
        `INSERT INTO boop_inboxes (inbox_locator, token_hash, created_at, last_polled_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(locator, tokenHash, now, now);
    return result.changes === 1 ? 'created' : 'locator_taken';
  }

  /**
   * Anonymous drop. Ids are random, never sequential — a global counter
   * would leak system-wide knock volume to every inbox owner. The arrival
   * throttle counts the current and previous hour buckets (timestamps are
   * hour-coarse), so it is approximate but never looser than one hour.
   */
  addKnock(locator: string, blob: string, now = Date.now()): KnockAddResult {
    const inbox = this.db
      .prepare('SELECT 1 FROM boop_inboxes WHERE inbox_locator = ?')
      .get(locator);
    if (!inbox) return 'not_found';
    const pending = this.db
      .prepare('SELECT COUNT(*) AS n FROM boop_knocks WHERE inbox_locator = ?')
      .get(locator) as { n: number };
    if (pending.n >= this.maxPending) return 'full';
    const recent = this.db
      .prepare('SELECT COUNT(*) AS n FROM boop_knocks WHERE inbox_locator = ? AND created_at >= ?')
      .get(locator, coarseNow(now) - HOUR) as { n: number };
    if (recent.n >= this.knocksPerHour) return 'throttled';
    this.db
      .prepare(
        `INSERT INTO boop_knocks (knock_id, inbox_locator, blob, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(randomBytes(16).toString('base64url'), locator, blob, coarseNow(now));
    return 'added';
  }

  /** Owner poll; bumps last_polled_at so a quiet-but-alive inbox survives GC. */
  list(locator: string, tokenHashHex: string): InboxListResult {
    const row = this.db
      .prepare('SELECT token_hash FROM boop_inboxes WHERE inbox_locator = ?')
      .get(locator) as { token_hash: string } | undefined;
    if (!row) return { status: 'not_found' };
    if (!tokenMatches(row.token_hash, tokenHashHex)) return { status: 'bad_token' };
    this.db
      .prepare('UPDATE boop_inboxes SET last_polled_at = ? WHERE inbox_locator = ?')
      .run(coarseNow(), locator);
    const knocks = this.db
      .prepare(
        `SELECT knock_id AS id, blob, created_at AS created FROM boop_knocks
          WHERE inbox_locator = ? ORDER BY created_at, knock_id`,
      )
      .all(locator) as { id: string; blob: string; created: number }[];
    return { status: 'ok', knocks };
  }

  deleteKnock(locator: string, tokenHashHex: string, knockId: string): KnockDeleteResult {
    const row = this.db
      .prepare('SELECT token_hash FROM boop_inboxes WHERE inbox_locator = ?')
      .get(locator) as { token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.token_hash, tokenHashHex)) return 'bad_token';
    const result = this.db
      .prepare('DELETE FROM boop_knocks WHERE knock_id = ? AND inbox_locator = ?')
      .run(knockId, locator);
    return result.changes === 1 ? 'deleted' : 'not_found';
  }

  deleteInbox(locator: string, tokenHashHex: string): InboxDeleteResult {
    const row = this.db
      .prepare('SELECT token_hash FROM boop_inboxes WHERE inbox_locator = ?')
      .get(locator) as { token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.token_hash, tokenHashHex)) return 'bad_token';
    this.db.prepare('DELETE FROM boop_knocks WHERE inbox_locator = ?').run(locator);
    this.db.prepare('DELETE FROM boop_inboxes WHERE inbox_locator = ?').run(locator);
    return 'deleted';
  }

  /**
   * GC sweep. Unread knocks die on the knock TTL (constructor param, not
   * the shared knobs); inboxes never polled within the idle TTL die with
   * their knocks — abandoned reply boxes ride the same clock. Hour-coarse
   * stamps get the hour back, so TTLs are guaranteed minimums.
   */
  sweep(_emptyTtlMs: number, idleTtlMs: number, now = Date.now()): number {
    const stale = this.db
      .prepare('DELETE FROM boop_knocks WHERE created_at < ?')
      .run(now - this.knockTtlMs - HOUR);
    const idleCutoff = now - idleTtlMs - HOUR;
    const idle = this.db
      .prepare(
        `DELETE FROM boop_inboxes
          WHERE (last_polled_at IS NULL OR last_polled_at < ?) AND created_at < ?`,
      )
      .run(idleCutoff, idleCutoff);
    const orphans = this.db
      .prepare(
        `DELETE FROM boop_knocks
          WHERE NOT EXISTS (SELECT 1 FROM boop_inboxes b
                             WHERE b.inbox_locator = boop_knocks.inbox_locator)`,
      )
      .run();
    return Number(stale.changes) + Number(idle.changes) + Number(orphans.changes);
  }

  close(): void {
    this.db.close();
  }
}
