// Garbage collection for hatched profiles: sweep once at startup, then on an
// interval. Policy lives in @moxy/core's hatch constants so the in-app
// warning copy and the server can't drift apart.
import type { ProfilesDb } from './profiles-db.ts';

export interface GcOptions {
  /** Profiles never populated die this long after creation. */
  emptyTtlMs: number;
  /** Populated profiles die after this long with no edit AND no view. */
  idleTtlMs: number;
  sweepIntervalMs: number;
}

/** Starts sweeping (immediately, then every interval). Returns a stopper. */
export function startGc(db: ProfilesDb, opts: GcOptions): () => void {
  const sweep = () => db.sweep(opts.emptyTtlMs, opts.idleTtlMs);
  sweep();
  const timer = setInterval(sweep, opts.sweepIntervalMs);
  // Never keep the process alive just to collect garbage.
  timer.unref();
  return () => clearInterval(timer);
}
