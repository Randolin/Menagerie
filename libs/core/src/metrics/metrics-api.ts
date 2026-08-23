// Anonymous-metrics wire types (v1). Deliberately dependency-free: the
// server imports this file relatively, so nothing here may import anything.
//
// The model: opted-in clients submit, once per monthly epoch, a list of
// coarse bucket ids ("3|sk.friend|1"). The server stores only counters per
// bucket and a hash of a dedup token that is unlinkable to any profile
// locator (separate KDF domain). Aggregates are served k-floored. The
// counters are plaintext BY DESIGN — that is the honest trade this opt-in
// feature makes, and desires ride in with randomized-response noise so any
// single submission is deniable even to the operator.

export interface SubmitMetricsRequest {
  epoch: string;
  token: string;
  buckets: string[];
}

export interface MetricsRecord {
  epoch: string;
  /** bucket id → count, k-floored (buckets under k are simply absent). */
  buckets: Record<string, number>;
}

export const METRICS_EPOCH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const METRICS_BUCKET_RE = /^[a-z0-9._|-]{1,80}$/;
export const METRICS_MAX_BUCKETS = 256;
/** Buckets with fewer than this many contributors are never served. */
export const METRICS_DEFAULT_K = 10;
/** Epochs older than this many months are dropped. */
export const METRICS_KEEP_EPOCHS = 3;
