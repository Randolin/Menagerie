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
import { GroupsDb } from './groups-db.ts';
import { MetricsDb } from './metrics-db.ts';
import { BoopsDb } from './boops-db.ts';
import { createApp } from './http.ts';
import { startGc } from './gc.ts';
import { EDIT_TOKEN_HEADER, NEW_EDIT_TOKEN_HEADER } from '../libs/core/src/hatch/hatch-api.ts';
import {
  ADMIN_TOKEN_HEADER,
  MEMBER_TOKEN_HEADER,
  NEW_ADMIN_TOKEN_HEADER,
} from '../libs/core/src/group/group-api.ts';
import { BOOP_TOKEN_HEADER } from '../libs/core/src/boop/boop-api.ts';
import { currentEpoch } from '../libs/core/src/metrics/metrics-api.ts';

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
let groups: GroupsDb;
let metrics: MetricsDb;
let boops: BoopsDb;
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
  groups = new GroupsDb(dbPath, 3); // tiny member cap to test 'full'
  metrics = new MetricsDb(dbPath);
  // Tiny pending cap / hourly throttle so 'full' and 'throttled' are testable.
  boops = new BoopsDb(dbPath, 4, 3, 30 * 86_400_000);
  raw = new DatabaseSync(dbPath);
  // Every request here shares one client key; keep the limiter out of the way.
  server = createServer(
    createApp({
      profiles,
      groups,
      metrics,
      boops,
      maxBlobBytes: 1024,
      trustProxy: false,
      readsPerMinute: 10_000,
      writesPerMinute: 10_000,
      metricsPerMinute: 10_000,
      boopsPerMinute: 10_000,
      metricsK: 2, // small k so the floor is testable
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
  groups.close();
  metrics.close();
  boops.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('v2 profiles: lifecycle', () => {
  test('health', async () => {
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
    expect(
      (await createProfile(VIEW_B, EDIT_B, TOKEN_B, { blob_view: 'not base64!' })).status,
    ).toBe(400);
    expect(
      (await createProfile(VIEW_B, EDIT_B, TOKEN_B, { blob_view: 'Z'.repeat(2000) })).status,
    ).toBe(400);
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

  test('a just-hatched profile survives ANY ttl — coarse stamps never shorten a life', async () => {
    expect((await createProfile(id('n'), id('o'), TOKEN_A)).status).toBe(201);
    // created_at is floored to the hour, making the row look up to an hour
    // old at birth; the sweep's coarseness slack must absorb that even at
    // ttl 0.
    expect(profiles.sweep(0, 0)).toBe(0);
    expect((await fetch(`${base}/v2/profiles/edit/${id('o')}`)).status).toBe(200);
    const del = await fetch(`${base}/v2/profiles/edit/${id('o')}`, {
      method: 'DELETE',
      headers: { [EDIT_TOKEN_HEADER]: TOKEN_A },
    });
    expect(del.status).toBe(204);
  });

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
    backdate(id('k'), {
      created_at: now - 400 * DAY,
      updated_at: now - 400 * DAY,
      last_viewed_at: now - DAY,
    });
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
    const capServer = createServer(
      createApp({
        profiles: capDb,
        groups: new GroupsDb(':memory:', 3),
        metrics: new MetricsDb(':memory:'),
        boops: new BoopsDb(':memory:', 4, 3, 30 * 86_400_000),
        maxBlobBytes: 1024,
        trustProxy: false,
        maxProfiles: 1,
      }),
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
    }
  });
});

describe('v2 groups: rosters and deposits', () => {
  const G = id('g');
  const G2 = id('h');
  const ADMIN = id('k');
  const M1 = id('m');
  const M1_TOKEN = id('n');
  const M2 = id('o');
  const M2_TOKEN = id('p');

  const createGroup = (locator: string, admin = ADMIN) =>
    fetch(`${base}/v2/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ADMIN_TOKEN_HEADER]: admin },
      body: JSON.stringify({ group_locator: locator, blob_meta: 'META0' }),
    });

  const join = (group: string, member: string, token: string, blob = 'DEP0') =>
    fetch(`${base}/v2/groups/${group}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [MEMBER_TOKEN_HEADER]: token },
      body: JSON.stringify({ member_locator: member, blob_member: blob }),
    });

  test('create → read roster → join → deposit appears', async () => {
    expect((await createGroup(G)).status).toBe(201);
    expect((await createGroup(G)).status).toBe(409); // locator taken

    const empty = await (await fetch(`${base}/v2/groups/${G}`)).json();
    expect(empty).toEqual({ blob_meta: 'META0', version: 1, members: [] });

    expect((await join(G, M1, M1_TOKEN)).status).toBe(201);
    const roster = await (await fetch(`${base}/v2/groups/${G}`)).json();
    expect(roster.members).toEqual([{ member_locator: M1, blob_member: 'DEP0', version: 1 }]);

    expect((await join(id('z'), M2, M2_TOKEN)).status).toBe(404); // no such group
  });

  test('member updates own deposit with CAS; wrong token refused', async () => {
    const put = (token: string, ifVersion: number) =>
      fetch(`${base}/v2/groups/${G}/members/${M1}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [MEMBER_TOKEN_HEADER]: token,
          'if-match': String(ifVersion),
        },
        body: JSON.stringify({ blob_member: 'DEP1' }),
      });
    expect((await put(M2_TOKEN, 1)).status).toBe(401);
    expect((await put(M1_TOKEN, 9)).status).toBe(409);
    const ok = await put(M1_TOKEN, 1);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 2 });
  });

  test('kick needs the admin token; leave needs the member token', async () => {
    expect((await join(G, M2, M2_TOKEN, 'DEP2')).status).toBe(201);
    const kickWrong = await fetch(`${base}/v2/groups/${G}/members/${M2}`, {
      method: 'DELETE',
      headers: { [ADMIN_TOKEN_HEADER]: id('x') },
    });
    expect(kickWrong.status).toBe(401);
    const kick = await fetch(`${base}/v2/groups/${G}/members/${M2}`, {
      method: 'DELETE',
      headers: { [ADMIN_TOKEN_HEADER]: ADMIN },
    });
    expect(kick.status).toBe(204);
    const leave = await fetch(`${base}/v2/groups/${G}/members/${M1}`, {
      method: 'DELETE',
      headers: { [MEMBER_TOKEN_HEADER]: M1_TOKEN },
    });
    expect(leave.status).toBe(204);
    const roster = await (await fetch(`${base}/v2/groups/${G}`)).json();
    expect(roster.members).toEqual([]);
  });

  test('member cap answers at_capacity', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await join(G, id(String(i)), id('q'))).status).toBe(201);
    }
    const fourth = await join(G, id('4'), id('r'));
    expect(fourth.status).toBe(503);
    expect((await fourth.json()).error).toBe('at_capacity');
  });

  test('re-mint moves the roster and its deposits to a new locator', async () => {
    const newAdmin = id('s');
    const rekey = await fetch(`${base}/v2/groups/${G}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [ADMIN_TOKEN_HEADER]: ADMIN,
        [NEW_ADMIN_TOKEN_HEADER]: newAdmin,
        'if-match': '1',
      },
      body: JSON.stringify({ blob_meta: 'META1', new_group_locator: G2 }),
    });
    expect(rekey.status).toBe(200);
    expect((await fetch(`${base}/v2/groups/${G}`)).status).toBe(404); // old phrase dead
    const moved = await (await fetch(`${base}/v2/groups/${G2}`)).json();
    expect(moved.blob_meta).toBe('META1');
    expect(moved.members.length).toBe(3); // deposits followed

    const del = await fetch(`${base}/v2/groups/${G2}`, {
      method: 'DELETE',
      headers: { [ADMIN_TOKEN_HEADER]: newAdmin }, // old admin token is dead too
    });
    expect(del.status).toBe(204);
    expect((await fetch(`${base}/v2/groups/${G2}`)).status).toBe(404);
  });

  test('GC: memberless groups die on the empty TTL, active ones idle out', async () => {
    expect((await createGroup(id('e'))).status).toBe(201);
    expect((await createGroup(id('f'))).status).toBe(201);
    expect((await join(id('f'), id('w'), id('v'))).status).toBe(201);
    raw.prepare('UPDATE groups SET created_at = created_at - ?').run(10 * DAY);
    groups.sweep(7 * DAY, 365 * DAY);
    expect((await fetch(`${base}/v2/groups/${id('e')}`)).status).toBe(404);
    expect((await fetch(`${base}/v2/groups/${id('f')}`)).status).toBe(200);
    // Now age everything past the idle TTL with no views since.
    raw.prepare('UPDATE groups SET updated_at = 0, last_viewed_at = NULL').run();
    groups.sweep(7 * DAY, 365 * DAY);
    expect((await fetch(`${base}/v2/groups/${id('f')}`)).status).toBe(404);
    const orphans = raw.prepare('SELECT COUNT(*) AS n FROM group_members').get()!;
    expect(orphans.n).toBe(0);
  });
});

describe('v2 metrics: epoch counters', () => {
  const epoch = currentEpoch(Date.now());

  const submit = (token: string, buckets: string[], ep = epoch) =>
    fetch(`${base}/v2/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ epoch: ep, token, buckets }),
    });

  test('submissions count once per token; k-floor hides thin buckets', async () => {
    expect((await submit(id('1'), ['age|1', '1|sk.friend|1'])).status).toBe(201);
    // Same token again → benign duplicate, counters untouched.
    expect((await submit(id('1'), ['age|1'])).status).toBe(409);
    // A second contributor lifts age|1 to k=2; the joint bucket stays under.
    expect((await submit(id('2'), ['age|1'])).status).toBe(201);

    const res = await fetch(`${base}/v2/metrics/${epoch}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age');
    const body = await res.json();
    expect(body.buckets['age|1']).toBe(2);
    expect(body.buckets['1|sk.friend|1']).toBeUndefined(); // n=1 < k=2
  });

  test('validation: wrong epoch, malformed token/buckets', async () => {
    expect((await submit(id('3'), ['age|1'], '1999-01')).status).toBe(400);
    expect((await submit('short', ['age|1'])).status).toBe(400);
    expect((await submit(id('3'), [])).status).toBe(400);
    expect((await submit(id('3'), ['BAD BUCKET!'])).status).toBe(400);
    expect((await fetch(`${base}/v2/metrics/not-an-epoch`)).status).toBe(400);
  });

  test('old epochs are dropped, newest three kept', () => {
    metrics.submit('2020-01', 'h1', ['age|0']);
    metrics.submit('2020-02', 'h2', ['age|0']);
    metrics.submit('2020-03', 'h3', ['age|0']);
    metrics.dropOldEpochs(3);
    // Current epoch + 2020-03 + 2020-02 are the newest three present.
    expect(metrics.get('2020-01', 1)).toEqual({});
    expect(metrics.get('2020-02', 1)).toEqual({ 'age|0': 1 });
  });
});

describe('v2 boops: inboxes and knocks', () => {
  const INBOX = id('x');
  const BTOKEN = id('y');

  function createInbox(locator: string, token: string) {
    return fetch(`${base}/v2/boops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locator, token }),
    });
  }

  function knock(locator: string, blob = 'SEALED') {
    return fetch(`${base}/v2/boops/${locator}/knocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blob }),
    });
  }

  function listKnocks(locator: string, token: string) {
    return fetch(`${base}/v2/boops/${locator}`, { headers: { [BOOP_TOKEN_HEADER]: token } });
  }

  test('create → anonymous knock → owner-only read', async () => {
    expect((await createInbox(INBOX, BTOKEN)).status).toBe(201);
    expect((await createInbox(INBOX, id('z'))).status).toBe(409); // locator taken

    expect((await knock(INBOX)).status).toBe(201);
    const listed = await listKnocks(INBOX, BTOKEN);
    expect(listed.status).toBe(200);
    const { knocks } = (await listed.json()) as {
      knocks: { id: string; blob: string; created: number }[];
    };
    expect(knocks).toHaveLength(1);
    expect(knocks[0].blob).toBe('SEALED');
    // Random id, not a counter — a sequential id would leak global volume.
    expect(knocks[0].id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(knocks[0].created % 3_600_000).toBe(0); // hour-coarse

    expect((await listKnocks(INBOX, id('z'))).status).toBe(401);
    expect((await listKnocks(id('9'), BTOKEN)).status).toBe(404);
    expect((await knock(id('9'))).status).toBe(404); // no inbox, no drop
  });

  test('knock validation: oversized and non-b64url blobs refused', async () => {
    expect((await knock(INBOX, 'not base64url!')).status).toBe(400);
    // This app's tiny maxBlobBytes hits the general body cap first; a
    // production-sized app must still refuse anything over the knock cap,
    // which is far below the profile blob cap.
    const wide = createServer(
      createApp({
        profiles,
        groups,
        metrics,
        boops,
        maxBlobBytes: 262_144,
        trustProxy: false,
        boopsPerMinute: 10_000,
      }),
    );
    await new Promise<void>((resolve) => wide.listen(0, '127.0.0.1', resolve));
    const address = wide.address();
    const wideBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const res = await fetch(`${wideBase}/v2/boops/${INBOX}/knocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blob: 'A'.repeat(5000) }),
    });
    expect(res.status).toBe(400);
    await new Promise((resolve) => wide.close(resolve));
  });

  test('per-inbox arrival throttle, then the pending cap', async () => {
    // Test DB: 3 knocks/hour, 4 pending max. One knock already sits from
    // the lifecycle test.
    expect((await knock(INBOX)).status).toBe(201);
    expect((await knock(INBOX)).status).toBe(201);
    const throttled = await knock(INBOX);
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toBe('3600');
    // Age the three past the throttle window: the cap (4) takes over.
    raw.prepare('UPDATE boop_knocks SET created_at = created_at - ?').run(3 * 3_600_000);
    expect((await knock(INBOX)).status).toBe(201);
    expect((await knock(INBOX)).status).toBe(503); // full
  });

  test('owner deletes knocks and finally the inbox itself', async () => {
    const { knocks } = (await (await listKnocks(INBOX, BTOKEN)).json()) as {
      knocks: { id: string }[];
    };
    expect(knocks.length).toBe(4);
    const one = await fetch(`${base}/v2/boops/${INBOX}/knocks/${knocks[0].id}`, {
      method: 'DELETE',
      headers: { [BOOP_TOKEN_HEADER]: BTOKEN },
    });
    expect(one.status).toBe(200);
    const again = await fetch(`${base}/v2/boops/${INBOX}/knocks/${knocks[0].id}`, {
      method: 'DELETE',
      headers: { [BOOP_TOKEN_HEADER]: BTOKEN },
    });
    expect(again.status).toBe(404);

    const gone = await fetch(`${base}/v2/boops/${INBOX}`, {
      method: 'DELETE',
      headers: { [BOOP_TOKEN_HEADER]: BTOKEN },
    });
    expect(gone.status).toBe(200);
    expect((await listKnocks(INBOX, BTOKEN)).status).toBe(404);
    expect((await knock(INBOX)).status).toBe(404);
    const orphaned = raw
      .prepare('SELECT COUNT(*) AS n FROM boop_knocks WHERE inbox_locator = ?')
      .get(INBOX) as { n: number };
    expect(orphaned.n).toBe(0);
  });

  test('GC: stale knocks die on the knock TTL; unpolled inboxes idle out', async () => {
    expect((await createInbox(id('g'), BTOKEN)).status).toBe(201);
    expect((await knock(id('g'))).status).toBe(201);
    // A fresh inbox+knock survive any shared TTL (knock TTL is its own knob).
    expect(boops.sweep(0, 365 * DAY)).toBe(0);
    // Backdate the knock past 30 days: it sweeps, the inbox stays.
    raw
      .prepare('UPDATE boop_knocks SET created_at = ? WHERE inbox_locator = ?')
      .run(Date.now() - 31 * DAY, id('g'));
    expect(boops.sweep(0, 365 * DAY)).toBe(1);
    expect((await listKnocks(id('g'), BTOKEN)).status).toBe(200);
    // A poll bumps the idle clock, so only truly abandoned inboxes die.
    raw
      .prepare('UPDATE boop_inboxes SET created_at = ?, last_polled_at = ? WHERE inbox_locator = ?')
      .run(Date.now() - 400 * DAY, Date.now() - 400 * DAY, id('g'));
    expect(boops.sweep(0, 365 * DAY)).toBe(1);
    expect((await listKnocks(id('g'), BTOKEN)).status).toBe(404);
  });

  test('capacity circuit breaker on inbox creation', async () => {
    const capped = createServer(
      createApp({
        profiles,
        groups,
        metrics,
        boops,
        maxBlobBytes: 1024,
        trustProxy: false,
        writesPerMinute: 10_000,
        maxBoopInboxes: boops.count(),
      }),
    );
    await new Promise<void>((resolve) => capped.listen(0, '127.0.0.1', resolve));
    const address = capped.address();
    const cappedBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const res = await fetch(`${cappedBase}/v2/boops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locator: id('q'), token: id('r') }),
    });
    expect(res.status).toBe(503);
    await new Promise((resolve) => capped.close(resolve));
  });
});
