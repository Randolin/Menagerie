// Moxy profile server — zero runtime dependencies, run directly with Node 24+:
//
//   node server/moxy-sync-server.ts
//
// Env:
//   PORT                 listen port (0 = ephemeral; the chosen port is
//                        printed as a {"listening": <port>} JSON line)
//   MOXY_DB_PATH         SQLite file (default ./moxy-sync.db; ':memory:' ok)
//   MOXY_MAX_BLOB_BYTES  ciphertext blob cap (default 262144)
//   MOXY_TRUST_PROXY     '1' to honor X-Forwarded-For for rate limiting
//   MOXY_MAX_PROFILES    hatch circuit breaker (default 100000; 503 beyond)
//   MOXY_MAX_GROUPS      group circuit breaker (default 10000; 503 beyond)
//   MOXY_MAX_GROUP_MEMBERS  deposits per group cap (default 32)
//   MOXY_METRICS_K       aggregate k-floor (default 10; buckets under k hidden)
//   MOXY_GC_EMPTY_MS     never-populated profiles die after this (default 7d)
//   MOXY_GC_IDLE_MS      populated ones after no edit+no view for (default 365d)
//   MOXY_GC_SWEEP_MS     sweep interval (default 1h)
//
// Privacy posture: stores only locator-addressed ciphertext, token hashes,
// and hour-coarse timestamps; no accounts, no identities, no request
// logging, IPs only in the in-memory rate limiter. Run TLS at a reverse
// proxy in front of this.
import { createServer } from 'node:http';
import { HATCH_DEFAULT_MAX_BLOB_BYTES } from '../libs/core/src/hatch/hatch-api.ts';
import { GROUP_MAX_MEMBERS } from '../libs/core/src/group/group-api.ts';
import { GC_EMPTY_MS, GC_IDLE_MS } from '../libs/core/src/hatch/constants.ts';
import { ProfilesDb } from './profiles-db.ts';
import { GroupsDb } from './groups-db.ts';
import { MetricsDb } from './metrics-db.ts';
import { createApp } from './http.ts';
import { startGc } from './gc.ts';

const port = Number(process.env['PORT'] ?? 8787);
const dbPath = process.env['MOXY_DB_PATH'] ?? './moxy-sync.db';
const maxBlobBytes = Number(process.env['MOXY_MAX_BLOB_BYTES'] ?? HATCH_DEFAULT_MAX_BLOB_BYTES);
const trustProxy = process.env['MOXY_TRUST_PROXY'] === '1';
const maxProfiles = Number(process.env['MOXY_MAX_PROFILES'] ?? 100_000);
const maxGroups = Number(process.env['MOXY_MAX_GROUPS'] ?? 10_000);
const maxGroupMembers = Number(process.env['MOXY_MAX_GROUP_MEMBERS'] ?? GROUP_MAX_MEMBERS);
const metricsK = Number(process.env['MOXY_METRICS_K'] ?? 10);
const gcEmptyMs = Number(process.env['MOXY_GC_EMPTY_MS'] ?? GC_EMPTY_MS);
const gcIdleMs = Number(process.env['MOXY_GC_IDLE_MS'] ?? GC_IDLE_MS);
const gcSweepMs = Number(process.env['MOXY_GC_SWEEP_MS'] ?? 3_600_000);

const profiles = new ProfilesDb(dbPath);
const groups = new GroupsDb(dbPath, maxGroupMembers);
const metrics = new MetricsDb(dbPath);
const stopGc = startGc([profiles, groups, metrics], {
  emptyTtlMs: gcEmptyMs,
  idleTtlMs: gcIdleMs,
  sweepIntervalMs: gcSweepMs,
});
const server = createServer(
  createApp({ profiles, groups, metrics, maxBlobBytes, trustProxy, maxProfiles, maxGroups, metricsK }),
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
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
