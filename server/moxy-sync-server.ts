// Moxy sync server — zero runtime dependencies, run directly with Node 24+:
//
//   node server/moxy-sync-server.ts
//
// Env:
//   PORT                 listen port (0 = ephemeral; the chosen port is
//                        printed as a {"listening": <port>} JSON line)
//   MOXY_DB_PATH         SQLite file (default ./moxy-sync.db; ':memory:' ok)
//   MOXY_MAX_BLOB_BYTES  vault blob cap (default 262144)
//   MOXY_TRUST_PROXY     '1' to honor X-Forwarded-For for rate limiting
//
// Privacy posture: stores only {locator → token-hash, ciphertext, version};
// no accounts, no identities, no request logging, IPs only in the in-memory
// rate limiter. Run TLS at a reverse proxy in front of this.
import { createServer } from 'node:http';
import { DEFAULT_MAX_BLOB_BYTES } from '../libs/core/src/sync/sync-api.ts';
import { VaultDb } from './db.ts';
import { createApp } from './http.ts';

const port = Number(process.env['PORT'] ?? 8787);
const dbPath = process.env['MOXY_DB_PATH'] ?? './moxy-sync.db';
const maxBlobBytes = Number(process.env['MOXY_MAX_BLOB_BYTES'] ?? DEFAULT_MAX_BLOB_BYTES);
const trustProxy = process.env['MOXY_TRUST_PROXY'] === '1';

const db = new VaultDb(dbPath);
const server = createServer(createApp(db, { maxBlobBytes, trustProxy }));

server.listen(port, () => {
  const address = server.address();
  const chosen = typeof address === 'object' && address ? address.port : port;
  console.log(JSON.stringify({ listening: chosen, db: dbPath }));
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
