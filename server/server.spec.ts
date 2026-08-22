// Integration tests: a real server on an ephemeral port, real fetch, an
// in-memory database. Covers the whole error taxonomy plus the documented
// locator-squatting behavior.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { VaultDb } from './db.ts';
import { createApp } from './http.ts';
import { WRITE_TOKEN_HEADER } from '../libs/core/src/sync/sync-api.ts';

let server: Server;
let base: string;
let db: VaultDb;

const LOC_A = 'aaaaaaaaaaaaaaaaaaaaaa';
const LOC_B = 'bbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = 'tttttttttttttttttttttt';
const OTHER_TOKEN = 'uuuuuuuuuuuuuuuuuuuuuu';

function put(locator: string, token: string, blob: string, ifVersion: number) {
  return fetch(`${base}/v1/vault/${locator}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      [WRITE_TOKEN_HEADER]: token,
      'if-match': String(ifVersion),
    },
    body: JSON.stringify({ blob }),
  });
}

beforeAll(async () => {
  db = new VaultDb(':memory:');
  server = createServer(createApp(db, { maxBlobBytes: 1024, trustProxy: false }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

describe('sync server', () => {
  test('health', async () => {
    const res = await fetch(`${base}/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('create → read round-trip, then CAS update', async () => {
    const created = await put(LOC_A, TOKEN, 'AAAA', 0);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ version: 1 });

    const read = await fetch(`${base}/v1/vault/${LOC_A}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ blob: 'AAAA', version: 1 });

    const updated = await put(LOC_A, TOKEN, 'BBBB', 1);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ version: 2 });
  });

  test('stale version → 409 carrying the current state', async () => {
    const res = await put(LOC_A, TOKEN, 'CCCC', 1); // current is 2
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('version_conflict');
    expect(body.version).toBe(2);
    expect(body.blob).toBe('BBBB');
  });

  test('wrong token → 401 on update and delete; blob untouched', async () => {
    expect((await put(LOC_A, OTHER_TOKEN, 'EVIL', 2)).status).toBe(401);
    const del = await fetch(`${base}/v1/vault/${LOC_A}`, {
      method: 'DELETE',
      headers: { [WRITE_TOKEN_HEADER]: OTHER_TOKEN },
    });
    expect(del.status).toBe(401);
    expect((await (await fetch(`${base}/v1/vault/${LOC_A}`)).json()).blob).toBe('BBBB');
  });

  test('squat scenario: a second create at an occupied locator conflicts, and the squatter cannot write', async () => {
    // OTHER_TOKEN holder tries to create at LOC_A (already owned by TOKEN).
    const res = await put(LOC_A, OTHER_TOKEN, 'SQUAT', 0);
    // ifVersion 0 on an existing row: token mismatch → 401 (not a silent overwrite).
    expect(res.status).toBe(401);
    // And when the squatter genuinely creates first at a fresh locator, the
    // true owner later gets a clean 401 — the documented DoS-only outcome.
    expect((await put(LOC_B, OTHER_TOKEN, 'SQUATTED', 0)).status).toBe(201);
    expect((await put(LOC_B, TOKEN, 'MINE', 0)).status).toBe(401);
  });

  test('delete with the right token; deleted vault reads 404; re-create allowed', async () => {
    const del = await fetch(`${base}/v1/vault/${LOC_A}`, {
      method: 'DELETE',
      headers: { [WRITE_TOKEN_HEADER]: TOKEN },
    });
    expect(del.status).toBe(204);
    expect((await fetch(`${base}/v1/vault/${LOC_A}`)).status).toBe(404);
    // If-Match > 0 with no row → 404 (client retries as create).
    expect((await put(LOC_A, TOKEN, 'NEW', 5)).status).toBe(404);
    expect((await put(LOC_A, TOKEN, 'NEW', 0)).status).toBe(201);
  });

  test('validation: bad locator, bad token format, bad blob, bad if-match', async () => {
    expect((await fetch(`${base}/v1/vault/short`)).status).toBe(400);
    const badToken = await fetch(`${base}/v1/vault/${LOC_A}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': '0' },
      body: JSON.stringify({ blob: 'AA' }),
    });
    expect(badToken.status).toBe(400);
    expect((await put(LOC_A, TOKEN, 'not base64url!!', 1)).status).toBe(400);
    const badIfMatch = await fetch(`${base}/v1/vault/${LOC_A}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [WRITE_TOKEN_HEADER]: TOKEN,
        'if-match': 'weak',
      },
      body: JSON.stringify({ blob: 'AA' }),
    });
    expect(badIfMatch.status).toBe(400);
  });

  test('oversize blob → 413', async () => {
    expect((await put(LOC_A, TOKEN, 'A'.repeat(2048), 1)).status).toBe(413);
  });

  test('CORS preflight and headers on responses', async () => {
    const preflight = await fetch(`${base}/v1/vault/${LOC_A}`, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-headers')).toContain(WRITE_TOKEN_HEADER);
    const read = await fetch(`${base}/v1/vault/${LOC_A}`);
    expect(read.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('database at rest stores the token hash, never the token', () => {
    // Reach into the DB double-checking the server-side secret hygiene.
    const raw = db.get(LOC_A);
    expect(raw?.blob).toBe('NEW');
    const expectedHash = createHash('sha256').update(TOKEN).digest('hex');
    // put() with a wrong-length hash must not match (guards the comparator).
    expect(db.put(LOC_A, expectedHash.slice(0, 10), 'X', 1).status).toBe('bad_token');
    expect(db.put(LOC_A, expectedHash, 'X', 1).status).toBe('updated');
  });
});
