// Anonymous counters (v1). Plaintext bucket counts BY DESIGN — this is the
// one deliberately readable table, holding only opt-in coarse aggregates
// plus hashed once-per-epoch dedup tokens that no profile locator links to.
import { DatabaseSync } from 'node:sqlite';
import { METRICS_KEEP_EPOCHS } from '../libs/core/src/metrics/metrics-api.ts';

export type SubmitResult = 'ok' | 'duplicate';

export class MetricsDb {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS metrics_counts (
        epoch  TEXT NOT NULL,
        bucket TEXT NOT NULL,
        n      INTEGER NOT NULL,
        PRIMARY KEY (epoch, bucket)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS metrics_tokens (
        epoch      TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY (epoch, token_hash)
      ) STRICT;
    `);
  }

  submit(epoch: string, tokenHash: string, buckets: readonly string[]): SubmitResult {
    const seen = this.db
      .prepare(
        `INSERT INTO metrics_tokens (epoch, token_hash) VALUES (?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(epoch, tokenHash);
    if (seen.changes !== 1) return 'duplicate';
    const bump = this.db.prepare(
      `INSERT INTO metrics_counts (epoch, bucket, n) VALUES (?, ?, 1)
       ON CONFLICT (epoch, bucket) DO UPDATE SET n = n + 1`,
    );
    for (const bucket of new Set(buckets)) bump.run(epoch, bucket);
    return 'ok';
  }

  /** All buckets for an epoch with n >= k. */
  get(epoch: string, k: number): Record<string, number> {
    const rows = this.db
      .prepare('SELECT bucket, n FROM metrics_counts WHERE epoch = ? AND n >= ?')
      .all(epoch, k) as { bucket: string; n: number }[];
    const out: Record<string, number> = {};
    for (const row of rows) out[row.bucket] = row.n;
    return out;
  }

  /** Drop epochs older than the newest `keep` distinct epochs present. */
  dropOldEpochs(keep: number): number {
    const epochs = this.db
      .prepare('SELECT DISTINCT epoch FROM metrics_counts ORDER BY epoch DESC')
      .all() as { epoch: string }[];
    const cutoff = epochs[keep - 1]?.epoch;
    if (!cutoff) return 0;
    const a = this.db.prepare('DELETE FROM metrics_counts WHERE epoch < ?').run(cutoff);
    const b = this.db.prepare('DELETE FROM metrics_tokens WHERE epoch < ?').run(cutoff);
    return Number(a.changes) + Number(b.changes);
  }

  /** Sweepable-compatible shim: TTL args don't apply to epoch retention. */
  sweep(_emptyTtlMs: number, _idleTtlMs: number): number {
    return this.dropOldEpochs(METRICS_KEEP_EPOCHS);
  }

  close(): void {
    this.db.close();
  }
}
