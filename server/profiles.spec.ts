// Integration tests for the v2 hatch profile API: a real server on an
// ephemeral port, real fetch, a file-backed database (so a second raw
// connection can backdate timestamps for GC-window tests).
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfilesDb } from './profiles-db.ts';
import { VaultDb } from './db.ts';
import { createApp } from './http.ts';
import { startGc } from './gc.ts';
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
} from '../libs/core/src/hatch/hatch-api.ts';

const DAY = 86_400_000;

// 22-char base64url locators/tokens (shape-valid, content arbitrary).
const id = (c: string) => c.repeat(22);
const VIEW_A = id('a');
const EDIT_A = id('b');
const TOKEN_A = id('t');
const VIEW_B = id('c');
const EDIT_B = id('d');
const TOKEN_B = id('u');

let dir: string;
let dbPath: string;
let server: Server;
let base: string;
let profiles: ProfilesDb;
let vaults: VaultDb;
/** Raw second connection for backdating rows in GC tests. */
let raw: DatabaseSync;

function createProfile(
  viewLocator: string,
  editLocator: string,
  token: string,
  blobs: Partial<{ blob_view: string; blob_priv: string }> = {},
) {
  return fetch(`${base}/v2/profiles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [EDIT_TOKEN_HEADER]: token },
    body: JSON.stringify({
      view_locator: viewLocator,
      edit_locator: editLocator,
      blob_view: blobs.blob_view ?? 'VIEW0',
      blob_priv: blobs.blob_priv ?? 'PRIV0',
    }),
  });
}

function putProfile(
  editLocator: string,
  token: string,
  ifVersion: number,
  body: Record<string, unknown>,
  newToken?: string,
) {
  return fetch(`${base}/v2/profiles/edit/${editLocator}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      [EDIT_TOKEN_HEADER]: token,
      'if-match': String(ifVersion),
      ...(newToken ? { [NEW_EDIT_TOKEN_HEADER]: newToken } : {}),
    },
    body: JSON.stringify({ blob_view: 'VIEW1', blob_priv: 'PRIV1', populated: false, ...body }),
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'moxy-profiles-'));
  dbPath = join(dir, 'test.db');
  profiles = new ProfilesDb(dbPath);
  vaults = new VaultDb(':memory:');
  raw = new DatabaseSync(dbPath);
  // Every request here shares one client key; keep the limiter out of the way.
  server = createServer(
    createApp(vaults, {
      maxBlobBytes: 1024,
      trustProxy: false,
      profiles,
      readsPerMinute: 10_000,
      writesPerMinute: 10_000,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  raw.close();
  profiles.close();
  vaults.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('v2 profiles: lifecycle', () => {
  test('both healths answer on the same app', async () => {
    expect((await fetch(`${base}/v1/health`)).status).toBe(200);
    const v2 = await fetch(`${base}/v2/health`);
    expect(v2.status).toBe(200);
    expect(await v2.json()).toEqual({ ok: true });
  });

  test('hatch → view and edit reads round-trip', async () => {
    const created = await createProfile(VIEW_A, EDIT_A, TOKEN_A);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ version: 1 });

    const view = await fetch(`${base}/v2/profiles/view/${VIEW_A}`);
    expect(view.status).toBe(200);
    expect(await view.json()).toEqual({ blob_view: 'VIEW0', version: 1 });

    const edit = await fetch(`${base}/v2/profiles/edit/${EDIT_A}`);
    expect(edit.status).toBe(200);
    expect(await edit.json()).toEqual({
      blob_view: 'VIEW0',
      blob_priv: 'PRIV0',
      version: 1,
      populated: false,
    });
  });

  test('view locator collision → 409 locator_taken, row untouched', async () => {
    const res = await createProfile(VIEW_A, EDIT_B, TOKEN_B);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('locator_taken');
    const view = await fetch(`${base}/v2/profiles/view/${VIEW_A}`);
    expect((await view.json()).blob_view).toBe('VIEW0');
  });

  test('create validation: bad token header, equal locators, bad blob', async () => {
    const noToken = await fetch(`${base}/v2/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        view_locator: VIEW_B,
        edit_locator: EDIT_B,
        blob_view: 'X',
        blob_priv: 'X',
      }),
    });
    expect(noToken.status).toBe(400);
    expect((await createProfile(VIEW_B, VIEW_B, TOKEN_B)).status).toBe(400);
    expect((await createProfile(VIEW_B, EDIT_B, TOKEN_B, { blob_view: 'not base64!' })).status).toBe(
      400,
    );
    expect((await createProfile(VIEW_B, EDIT_B, TOKEN_B, { blob_view: 'Z'.repeat(2000) })).status).toBe(
      400,
    );
  });

  test('PUT updates with CAS; populated is monotonic', async () => {
    const updated = await putProfile(EDIT_A, TOKEN_A, 1, { populated: true });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ version: 2 });

    // Attempting to un-populate is ignored server-side.
    const again = await putProfile(EDIT_A, TOKEN_A, 2, { populated: false });
    expect(again.status).toBe(200);
    const edit = await fetch(`${base}/v2/profiles/edit/${EDIT_A}`);
    expect((await edit.json()).populated).toBe(true);
  });

  test('stale If-Match → 409 version_conflict carrying current blobs', async () => {
    const res = await putProfile(EDIT_A, TOKEN_A, 1, {});
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('version_conflict');
    expect(body.version).toBe(3);
    expect(body.blob_view).toBe('VIEW1');
    expect(body.blob_priv).toBe('PRIV1');
  });

  test('wrong token → 401 on PUT and DELETE; record untouched', async () => {
    expect((await putProfile(EDIT_A, TOKEN_B, 3, {})).status).toBe(401);
    const del = await fetch(`${base}/v2/profiles/edit/${EDIT_A}`, {
      method: 'DELETE',
      headers: { [EDIT_TOKEN_HEADER]: TOKEN_B },
    });
    expect(del.status).toBe(401);
    expect((await fetch(`${base}/v2/profiles/edit/${EDIT_A}`)).status).toBe(200);
  });

  test('unknown locators → 404', async () => {
    expect((await fetch(`${base}/v2/profiles/view/${id('z')}`)).status).toBe(404);
    expect((await fetch(`${base}/v2/profiles/edit/${id('z')}`)).status).toBe(404);
    expect((await putProfile(id('z'), TOKEN_A, 1, {})).status).toBe(404);
  });

  test('malformed locator → 400, not 404', async () => {
    expect((await fetch(`${base}/v2/profiles/view/short`)).status).toBe(400);
  });
});

describe('v2 profiles: re-keying', () => {
  test('regenerate view phrase: atomic view-locator move', async () => {
    const NEW_VIEW = id('e');
    const res = await putProfile(EDIT_A, TOKEN_A, 3, {
      populated: true,
      new_view_locator: NEW_VIEW,
    });
    expect(res.status).toBe(200);
    expect((await fetch(`${base}/v2/profiles/view/${VIEW_A}`)).status).toBe(404);
    const moved = await fetch(`${base}/v2/profiles/view/${NEW_VIEW}`);
    expect(moved.status).toBe(200);
    expect((await moved.json()).version).toBe(4);
  });

  test('change edit phrase: locator + token move together; old credentials die', async () => {
    const NEW_EDIT = id('f');
    const NEW_TOKEN = id('g');

    // New locator without the new-token header is rejected.
    const missing = await putProfile(EDIT_A, TOKEN_A, 4, { new_edit_locator: NEW_EDIT });
    expect(missing.status).toBe(400);

    const res = await putProfile(EDIT_A, TOKEN_A, 4, { new_edit_locator: NEW_EDIT }, NEW_TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 5 });

    expect((await fetch(`${base}/v2/profiles/edit/${EDIT_A}`)).status).toBe(404);
    expect((await fetch(`${base}/v2/profiles/edit/${NEW_EDIT}`)).status).toBe(200);
    // Old token no longer works at the new locator; new one does.
    expect((await putProfile(NEW_EDIT, TOKEN_A, 5, {})).status).toBe(401);
    expect((await putProfile(NEW_EDIT, NEW_TOKEN, 5, { populated: true })).status).toBe(200);
  });

  test('re-key collision → 409 locator_taken, record unchanged', async () => {
    const created = await createProfile(VIEW_B, EDIT_B, TOKEN_B);
    expect(created.status).toBe(201);
    const res = await putProfile(EDIT_B, TOKEN_B, 1, { new_view_locator: id('e') }); // taken above
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('locator_taken');
    const intact = await fetch(`${base}/v2/profiles/edit/${EDIT_B}`);
    expect(await intact.json()).toEqual({
      blob_view: 'VIEW0',
      blob_priv: 'PRIV0',
      version: 1,
      populated: false,
    });
  });

  test('delete with the right token', async () => {
    const del = await fetch(`${base}/v2/profiles/edit/${EDIT_B}`, {
      method: 'DELETE',
      headers: { [EDIT_TOKEN_HEADER]: TOKEN_B },
    });
    expect(del.status).toBe(204);
    expect((await fetch(`${base}/v2/profiles/view/${VIEW_B}`)).status).toBe(404);
  });
});

describe('v2 profiles: garbage collection', () => {
  function backdate(editLocator: string, fields: Record<string, number | null>): void {
    const sets = Object.keys(fields)
      .map((k) => `${k} = ?`)
      .join(', ');
    raw
      .prepare(`UPDATE profiles SET ${sets} WHERE edit_locator = ?`)
      .run(...Object.values(fields), editLocator);
  }

  test('sweep: empty profiles die after the empty TTL, fresh ones survive', async () => {
    const now = Date.now();
    expect((await createProfile(id('h'), id('i'), TOKEN_A)).status).toBe(201);
    expect((await createProfile(id('j'), id('k'), TOKEN_A)).status).toBe(201);
    backdate(id('i'), { created_at: now - 8 * DAY });

    const removed = profiles.sweep(7 * DAY, 365 * DAY, now);
    expect(removed).toBe(1);
    expect((await fetch(`${base}/v2/profiles/edit/${id('i')}`)).status).toBe(404);
    expect((await fetch(`${base}/v2/profiles/edit/${id('k')}`)).status).toBe(200);
  });

  test('sweep: populated profiles need no edit AND no view to die; a view saves them', async () => {
    const now = Date.now();
    expect((await putProfile(id('k'), TOKEN_A, 1, { populated: true })).status).toBe(200);

    // Old but recently viewed → survives.
    backdate(id('k'), { created_at: now - 400 * DAY, updated_at: now - 400 * DAY, last_viewed_at: now - DAY });
    expect(profiles.sweep(7 * DAY, 365 * DAY, now)).toBe(0);

    // Old and last viewed even longer ago → collected.
    backdate(id('k'), { last_viewed_at: now - 400 * DAY });
    expect(profiles.sweep(7 * DAY, 365 * DAY, now)).toBe(1);
    expect((await fetch(`${base}/v2/profiles/view/${id('j')}`)).status).toBe(404);
  });

  test('a view read bumps last_viewed_at (hour-coarse)', async () => {
    expect((await createProfile(id('l'), id('m'), TOKEN_A)).status).toBe(201);
    backdate(id('m'), { last_viewed_at: null });
    await fetch(`${base}/v2/profiles/view/${id('l')}`);
    const row = raw
      .prepare('SELECT last_viewed_at FROM profiles WHERE edit_locator = ?')
      .get(id('m')) as { last_viewed_at: number };
    expect(row.last_viewed_at).toBeGreaterThan(0);
    expect(row.last_viewed_at % 3_600_000).toBe(0);
  });

  test('startGc sweeps immediately and can be stopped', async () => {
    backdate(id('m'), { created_at: Date.now() - 8 * DAY });
    const stop = startGc(profiles, {
      emptyTtlMs: 7 * DAY,
      idleTtlMs: 365 * DAY,
      sweepIntervalMs: 60 * 60_000,
    });
    stop();
    expect((await fetch(`${base}/v2/profiles/edit/${id('m')}`)).status).toBe(404);
  });
});

describe('v2 profiles: capacity circuit breaker', () => {
  test('POST answers 503 at_capacity once maxProfiles is reached', async () => {
    const capDb = new ProfilesDb(':memory:');
    const capVaults = new VaultDb(':memory:');
    const capServer = createServer(
      createApp(capVaults, { maxBlobBytes: 1024, trustProxy: false, profiles: capDb, maxProfiles: 1 }),
    );
    await new Promise<void>((resolve) => capServer.listen(0, '127.0.0.1', resolve));
    const address = capServer.address();
    const capBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    try {
      const first = await fetch(`${capBase}/v2/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [EDIT_TOKEN_HEADER]: TOKEN_A },
        body: JSON.stringify({
          view_locator: VIEW_A,
          edit_locator: EDIT_A,
          blob_view: 'X',
          blob_priv: 'X',
        }),
      });
      expect(first.status).toBe(201);
      const second = await fetch(`${capBase}/v2/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [EDIT_TOKEN_HEADER]: TOKEN_B },
        body: JSON.stringify({
          view_locator: VIEW_B,
          edit_locator: EDIT_B,
          blob_view: 'X',
          blob_priv: 'X',
        }),
      });
      expect(second.status).toBe(503);
      expect((await second.json()).error).toBe('at_capacity');
    } finally {
      await new Promise((resolve) => capServer.close(resolve));
      capDb.close();
      capVaults.close();
    }
  });
});
