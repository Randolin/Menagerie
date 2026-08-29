// Menagerie profile server — zero runtime dependencies, run directly with Node 24+:
//
//   node server/menagerie-sync-server.ts
//
// Env:
//   PORT                 listen port (0 = ephemeral; the chosen port is
//                        printed as a {"listening": <port>} JSON line)
//   MENAGERIE_DB_PATH         SQLite file (default ./menagerie-sync.db; ':memory:' ok)
//   MENAGERIE_MAX_BLOB_BYTES  ciphertext blob cap (default 262144)
//   MENAGERIE_TRUST_PROXY     '1' to honor X-Forwarded-For for rate limiting
//   MENAGERIE_MAX_PROFILES    hatch circuit breaker (default 100000; 503 beyond)
//   MENAGERIE_MAX_GROUPS      group circuit breaker (default 10000; 503 beyond)
//   MENAGERIE_MAX_GROUP_MEMBERS  deposits per group cap (default 32)
//   MENAGERIE_MAX_BOOP_INBOXES boop inbox circuit breaker (default 200000; 503 beyond)
//   MENAGERIE_METRICS_K       aggregate k-floor (default 10; buckets under k hidden)
//   MENAGERIE_READS_PER_MINUTE   per-IP GET budget (default 120)
//   MENAGERIE_WRITES_PER_MINUTE  per-IP write budget (default 30)
//   MENAGERIE_BOOPS_PER_MINUTE   per-IP knock-POST budget (default 5)
//   MENAGERIE_METRICS_PER_MINUTE per-IP metrics-POST budget (default 5)
//   MENAGERIE_GC_EMPTY_MS     never-populated profiles die after this (default 7d)
//   MENAGERIE_GC_IDLE_MS      populated ones after no edit+no view for (default 365d)
//   MENAGERIE_GC_SWEEP_MS     sweep interval (default 1h)
//
// Privacy posture: stores only locator-addressed ciphertext, token hashes,
// and hour-coarse timestamps; no accounts, no identities, no request
// logging, IPs only in the in-memory rate limiter. Run TLS at a reverse
// proxy in front of this.
import { createServer } from 'node:http';
import { HATCH_DEFAULT_MAX_BLOB_BYTES } from '../libs/core/src/hatch/hatch-api.ts';
import { GROUP_MAX_MEMBERS } from '../libs/core/src/group/group-api.ts';
import {
  BOOP_KNOCKS_PER_HOUR,
  BOOP_KNOCK_TTL_MS,
  BOOP_MAX_PENDING,
} from '../libs/core/src/boop/boop-api.ts';
import { GC_EMPTY_MS, GC_IDLE_MS } from '../libs/core/src/hatch/constants.ts';
import { ProfilesDb } from './profiles-db.ts';
import { GroupsDb } from './groups-db.ts';
import { MetricsDb } from './metrics-db.ts';
import { BoopsDb } from './boops-db.ts';
import { createApp } from './http.ts';
import { startGc } from './gc.ts';

const port = Number(process.env['PORT'] ?? 8787);
const dbPath = process.env['MENAGERIE_DB_PATH'] ?? './menagerie-sync.db';
const maxBlobBytes = Number(
  process.env['MENAGERIE_MAX_BLOB_BYTES'] ?? HATCH_DEFAULT_MAX_BLOB_BYTES,
);
const trustProxy = process.env['MENAGERIE_TRUST_PROXY'] === '1';
const maxProfiles = Number(process.env['MENAGERIE_MAX_PROFILES'] ?? 100_000);
const maxGroups = Number(process.env['MENAGERIE_MAX_GROUPS'] ?? 10_000);
const maxGroupMembers = Number(process.env['MENAGERIE_MAX_GROUP_MEMBERS'] ?? GROUP_MAX_MEMBERS);
const maxBoopInboxes = Number(process.env['MENAGERIE_MAX_BOOP_INBOXES'] ?? 200_000);
const readsPerMinute = Number(process.env['MENAGERIE_READS_PER_MINUTE'] ?? 120);
const writesPerMinute = Number(process.env['MENAGERIE_WRITES_PER_MINUTE'] ?? 30);
const boopsPerMinute = Number(process.env['MENAGERIE_BOOPS_PER_MINUTE'] ?? 5);
const metricsPerMinute = Number(process.env['MENAGERIE_METRICS_PER_MINUTE'] ?? 5);
const metricsK = Number(process.env['MENAGERIE_METRICS_K'] ?? 10);
const gcEmptyMs = Number(process.env['MENAGERIE_GC_EMPTY_MS'] ?? GC_EMPTY_MS);
const gcIdleMs = Number(process.env['MENAGERIE_GC_IDLE_MS'] ?? GC_IDLE_MS);
const gcSweepMs = Number(process.env['MENAGERIE_GC_SWEEP_MS'] ?? 3_600_000);

const profiles = new ProfilesDb(dbPath);
const groups = new GroupsDb(dbPath, maxGroupMembers);
const metrics = new MetricsDb(dbPath);
const boops = new BoopsDb(dbPath, BOOP_MAX_PENDING, BOOP_KNOCKS_PER_HOUR, BOOP_KNOCK_TTL_MS);
const stopGc = startGc([profiles, groups, metrics, boops], {
  emptyTtlMs: gcEmptyMs,
  idleTtlMs: gcIdleMs,
  sweepIntervalMs: gcSweepMs,
});
const server = createServer(
  createApp({
    profiles,
    groups,
    metrics,
    boops,
    maxBlobBytes,
    trustProxy,
    maxProfiles,
    maxGroups,
    maxBoopInboxes,
    metricsK,
    readsPerMinute,
    writesPerMinute,
    boopsPerMinute,
    metricsPerMinute,
  }),
);

server.listen(port, () => {
  const address = server.address();
  const chosen = typeof address === 'object' && address ? address.port : port;
  console.log(JSON.stringify({ listening: chosen, db: dbPath }));
});

function shutdown(): void {
  stopGc();
  server.close(() => {
    profiles.close();
    groups.close();
    metrics.close();
    boops.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
