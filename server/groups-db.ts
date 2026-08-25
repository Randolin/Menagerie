// Group roster storage (v1). One row per group (meta blob + admin token
// hash) and one row per member deposit (its own random locator + token).
// Everything content-shaped is ciphertext under the group key, which the
// server never sees; what the server unavoidably learns in this model is
// how many deposits each group holds.
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';

export interface GroupRow {
  blob_meta: string;
  version: number;
  members: { member_locator: string; blob_member: string; version: number }[];
}

export type GroupCreateResult = 'created' | 'locator_taken';
export type JoinResult = 'joined' | 'locator_taken' | 'group_not_found' | 'full';
export type MemberPutResult = 'updated' | 'bad_token' | 'not_found' | 'conflict';
export type MemberDeleteResult = 'deleted' | 'bad_token' | 'not_found';
export type GroupDeleteResult = 'deleted' | 'bad_token' | 'not_found';

export interface GroupPutInput {
  blob_meta: string;
  newGroupLocator?: string;
  newAdminTokenHash?: string;
}

export type GroupPutResult =
  | { status: 'updated'; version: number }
  | { status: 'conflict'; version: number; blob_meta: string }
  | { status: 'bad_token' }
  | { status: 'not_found' }
  | { status: 'locator_taken' };

const HOUR = 3_600_000;

function coarseNow(): number {
  return Math.floor(Date.now() / HOUR) * HOUR;
}

function tokenMatches(storedHex: string, presentedHex: string): boolean {
  const a = Buffer.from(storedHex, 'hex');
  const b = Buffer.from(presentedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GroupsDb {
  private readonly db: DatabaseSync;
  private readonly maxMembers: number;

  constructor(path: string, maxMembers: number) {
    this.maxMembers = maxMembers;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS groups (
        group_locator    TEXT PRIMARY KEY,
        admin_token_hash TEXT NOT NULL,
        blob_meta        TEXT NOT NULL,
        version          INTEGER NOT NULL,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        last_viewed_at   INTEGER
      ) STRICT;
      CREATE TABLE IF NOT EXISTS group_members (
        member_locator    TEXT PRIMARY KEY,
        group_locator     TEXT NOT NULL,
        member_token_hash TEXT NOT NULL,
        blob_member       TEXT NOT NULL,
        version           INTEGER NOT NULL,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_members_group
        ON group_members (group_locator);
    `);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number };
    return row.n;
  }

  create(groupLocator: string, adminTokenHash: string, blobMeta: string): GroupCreateResult {
    const now = coarseNow();
    const result = this.db
      .prepare(
        `INSERT INTO groups
           (group_locator, admin_token_hash, blob_meta, version, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(groupLocator, adminTokenHash, blobMeta, now, now);
    return result.changes === 1 ? 'created' : 'locator_taken';
  }

  /** Read the whole roster; bumps last_viewed_at (hour-coarse). */
  get(groupLocator: string): GroupRow | null {
    const group = this.db
      .prepare('SELECT blob_meta, version FROM groups WHERE group_locator = ?')
      .get(groupLocator) as { blob_meta: string; version: number } | undefined;
    if (!group) return null;
    this.db
      .prepare('UPDATE groups SET last_viewed_at = ? WHERE group_locator = ?')
      .run(coarseNow(), groupLocator);
    const members = this.db
      .prepare(
        `SELECT member_locator, blob_member, version FROM group_members
          WHERE group_locator = ? ORDER BY created_at, member_locator`,
      )
      .all(groupLocator) as { member_locator: string; blob_member: string; version: number }[];
    return { blob_meta: group.blob_meta, version: group.version, members };
  }

  put(
    groupLocator: string,
    adminTokenHashHex: string,
    ifVersion: number,
    input: GroupPutInput,
  ): GroupPutResult {
    const row = this.db
      .prepare('SELECT admin_token_hash, blob_meta, version FROM groups WHERE group_locator = ?')
      .get(groupLocator) as
      { admin_token_hash: string; blob_meta: string; version: number } | undefined;
    if (!row) return { status: 'not_found' };
    if (!tokenMatches(row.admin_token_hash, adminTokenHashHex)) return { status: 'bad_token' };
    if (row.version !== ifVersion) {
      return { status: 'conflict', version: row.version, blob_meta: row.blob_meta };
    }
    const nextLocator = input.newGroupLocator ?? groupLocator;
    const nextTokenHash = input.newAdminTokenHash ?? row.admin_token_hash;
    try {
      const result = this.db
        .prepare(
          `UPDATE groups
             SET group_locator = ?, admin_token_hash = ?, blob_meta = ?,
                 version = version + 1, updated_at = ?
           WHERE group_locator = ? AND version = ?`,
        )
        .run(nextLocator, nextTokenHash, input.blob_meta, coarseNow(), groupLocator, ifVersion);
      if (result.changes !== 1) return { status: 'not_found' };
      if (nextLocator !== groupLocator) {
        // Re-mint: deposits follow the roster to its new locator.
        this.db
          .prepare('UPDATE group_members SET group_locator = ? WHERE group_locator = ?')
          .run(nextLocator, groupLocator);
      }
      return { status: 'updated', version: ifVersion + 1 };
    } catch (err) {
      if (String(err).includes('constraint')) return { status: 'locator_taken' };
      throw err;
    }
  }

  delete(groupLocator: string, adminTokenHashHex: string): GroupDeleteResult {
    const row = this.db
      .prepare('SELECT admin_token_hash FROM groups WHERE group_locator = ?')
      .get(groupLocator) as { admin_token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.admin_token_hash, adminTokenHashHex)) return 'bad_token';
    this.db.prepare('DELETE FROM group_members WHERE group_locator = ?').run(groupLocator);
    this.db.prepare('DELETE FROM groups WHERE group_locator = ?').run(groupLocator);
    return 'deleted';
  }

  join(
    groupLocator: string,
    memberLocator: string,
    memberTokenHash: string,
    blobMember: string,
  ): JoinResult {
    const group = this.db.prepare('SELECT 1 FROM groups WHERE group_locator = ?').get(groupLocator);
    if (!group) return 'group_not_found';
    const count = this.db
      .prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_locator = ?')
      .get(groupLocator) as { n: number };
    if (count.n >= this.maxMembers) return 'full';
    const now = coarseNow();
    const result = this.db
      .prepare(
        `INSERT INTO group_members
           (member_locator, group_locator, member_token_hash, blob_member,
            version, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(memberLocator, groupLocator, memberTokenHash, blobMember, now, now);
    return result.changes === 1 ? 'joined' : 'locator_taken';
  }

  putMember(
    memberLocator: string,
    memberTokenHashHex: string,
    ifVersion: number,
    blobMember: string,
  ): MemberPutResult {
    const row = this.db
      .prepare('SELECT member_token_hash, version FROM group_members WHERE member_locator = ?')
      .get(memberLocator) as { member_token_hash: string; version: number } | undefined;
    if (!row) return 'not_found';
    if (!tokenMatches(row.member_token_hash, memberTokenHashHex)) return 'bad_token';
    if (row.version !== ifVersion) return 'conflict';
    this.db
      .prepare(
        `UPDATE group_members SET blob_member = ?, version = version + 1, updated_at = ?
          WHERE member_locator = ? AND version = ?`,
      )
      .run(blobMember, coarseNow(), memberLocator, ifVersion);
    return 'updated';
  }

  /** Leave (member token) or kick (admin token of the deposit's group). */
  deleteMember(memberLocator: string, tokenHashHex: string): MemberDeleteResult {
    const row = this.db
      .prepare(
        `SELECT m.member_token_hash, g.admin_token_hash
           FROM group_members m JOIN groups g ON g.group_locator = m.group_locator
          WHERE m.member_locator = ?`,
      )
      .get(memberLocator) as { member_token_hash: string; admin_token_hash: string } | undefined;
    if (!row) return 'not_found';
    if (
      !tokenMatches(row.member_token_hash, tokenHashHex) &&
      !tokenMatches(row.admin_token_hash, tokenHashHex)
    ) {
      return 'bad_token';
    }
    this.db.prepare('DELETE FROM group_members WHERE member_locator = ?').run(memberLocator);
    return 'deleted';
  }

  /**
   * GC sweep, mirroring profiles: hour-coarse timestamps get the hour back,
   * so TTLs are guaranteed minimums. Memberless groups die on the empty TTL;
   * untouched-and-unviewed groups die on the idle TTL, deposits with them.
   */
  sweep(emptyTtlMs: number, idleTtlMs: number, now = Date.now()): number {
    const emptyCutoff = now - emptyTtlMs - HOUR;
    const idleCutoff = now - idleTtlMs - HOUR;
    const empty = this.db
      .prepare(
        `DELETE FROM groups
          WHERE created_at < ?
            AND NOT EXISTS (SELECT 1 FROM group_members m
                             WHERE m.group_locator = groups.group_locator)`,
      )
      .run(emptyCutoff);
    const idle = this.db
      .prepare(
        `DELETE FROM groups
          WHERE updated_at < ?
            AND (last_viewed_at IS NULL OR last_viewed_at < ?)`,
      )
      .run(idleCutoff, idleCutoff);
    const orphans = this.db
      .prepare(
        `DELETE FROM group_members
          WHERE NOT EXISTS (SELECT 1 FROM groups g
                             WHERE g.group_locator = group_members.group_locator)`,
      )
      .run();
    return Number(empty.changes) + Number(idle.changes) + Number(orphans.changes);
  }

  close(): void {
    this.db.close();
  }
}
