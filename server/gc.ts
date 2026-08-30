// Garbage collection: sweep once at startup, then on an interval. Policy
// lives in @mng/core's hatch constants so the in-app warning copy and the
// server can't drift apart. Any store with a compatible sweep() rides the
// same schedule (profiles, group rosters).
export interface Sweepable {
  sweep(emptyTtlMs: number, idleTtlMs: number): number;
}

export interface GcOptions {
  /** Never-populated profiles / memberless groups die this long after creation. */
  emptyTtlMs: number;
  /** Populated rows die after this long with no edit AND no view. */
  idleTtlMs: number;
  sweepIntervalMs: number;
}

/** Starts sweeping (immediately, then every interval). Returns a stopper. */
export function startGc(dbs: Sweepable | Sweepable[], opts: GcOptions): () => void {
  const list = Array.isArray(dbs) ? dbs : [dbs];
  const sweep = () => list.reduce((n, db) => n + db.sweep(opts.emptyTtlMs, opts.idleTtlMs), 0);
  sweep();
  const timer = setInterval(sweep, opts.sweepIntervalMs);
  // Never keep the process alive just to collect garbage.
  timer.unref();
  return () => clearInterval(timer);
}
