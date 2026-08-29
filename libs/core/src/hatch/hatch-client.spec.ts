import { describe, expect, test } from 'vitest';
import { HatchClient, HatchError, hatchFailureMessage, type HatchFailure } from './hatch-client';
import { EDIT_TOKEN_HEADER, NEW_EDIT_TOKEN_HEADER } from './hatch-api';
import { BOOP_TOKEN_HEADER } from '../boop/boop-api';

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Fake fetch: records the request, replies with a canned response. */
function fake(status: number, body?: unknown): { fetch: typeof fetch; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetch: fetchFn, captured };
}

async function failure(promise: Promise<unknown>): Promise<HatchFailure> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HatchError);
    return (err as HatchError).failure;
  }
  throw new Error('expected a HatchError');
}

const LOC = 'aaaaaaaaaaaaaaaaaaaaaa';
const TOKEN = 'tttttttttttttttttttttt';
const CREATE = {
  view_locator: 'vvvvvvvvvvvvvvvvvvvvvv',
  edit_locator: LOC,
  blob_view: 'VIEW',
  blob_priv: 'PRIV',
};

describe('HatchClient.create', () => {
  test('POSTs the request with the edit token header', async () => {
    const { fetch, captured } = fake(201, { version: 1 });
    await new HatchClient('https://sync.example/', fetch).create(CREATE, TOKEN);
    expect(captured[0].url).toBe('https://sync.example/v2/profiles');
    expect(captured[0].method).toBe('POST');
    expect(captured[0].headers[EDIT_TOKEN_HEADER]).toBe(TOKEN);
    expect(captured[0].body).toEqual(CREATE);
  });

  test('locator collision and capacity map to their own kinds', async () => {
    const taken = fake(409, { error: 'locator_taken' });
    expect(await failure(new HatchClient('https://s', taken.fetch).create(CREATE, TOKEN))).toEqual({
      kind: 'locator_taken',
    });

    const full = fake(503, { error: 'at_capacity' });
    expect(await failure(new HatchClient('https://s', full.fetch).create(CREATE, TOKEN))).toEqual({
      kind: 'at_capacity',
    });
  });
});

describe('HatchClient reads', () => {
  test('getView parses the record; 404 is null, not an error', async () => {
    const ok = fake(200, { blob_view: 'VIEW', version: 3 });
    const client = new HatchClient('https://s', ok.fetch);
    expect(await client.getView(LOC)).toEqual({ blob_view: 'VIEW', version: 3 });
    expect(ok.captured[0].url).toBe(`https://s/v2/profiles/view/${LOC}`);

    const gone = fake(404, { error: 'not_found' });
    expect(await new HatchClient('https://s', gone.fetch).getView(LOC)).toBeNull();
  });

  test('getEdit parses the full record; carries no token (locator is the capability)', async () => {
    const ok = fake(200, { blob_view: 'V', blob_priv: 'P', version: 2, populated: true });
    const client = new HatchClient('https://s', ok.fetch);
    expect(await client.getEdit(LOC)).toEqual({
      blob_view: 'V',
      blob_priv: 'P',
      version: 2,
      populated: true,
    });
    expect(ok.captured[0].headers[EDIT_TOKEN_HEADER]).toBeUndefined();
  });

  test('rate limiting surfaces as its own kind', async () => {
    const limited = fake(429, { error: 'rate_limited' });
    expect(await failure(new HatchClient('https://s', limited.fetch).getView(LOC))).toEqual({
      kind: 'rate_limited',
    });
  });
});

describe('HatchClient.put', () => {
  const BODY = { blob_view: 'V2', blob_priv: 'P2', populated: true };

  test('sends token + If-Match; resolves the new version', async () => {
    const { fetch, captured } = fake(200, { version: 5 });
    const version = await new HatchClient('https://s', fetch).put(LOC, TOKEN, 4, BODY);
    expect(version).toBe(5);
    expect(captured[0].headers['if-match']).toBe('4');
    expect(captured[0].headers[EDIT_TOKEN_HEADER]).toBe(TOKEN);
    expect(captured[0].headers[NEW_EDIT_TOKEN_HEADER]).toBeUndefined();
  });

  test('re-key rides the new edit token header', async () => {
    const { fetch, captured } = fake(200, { version: 5 });
    await new HatchClient('https://s', fetch).put(
      LOC,
      TOKEN,
      4,
      { ...BODY, new_edit_locator: 'nnnnnnnnnnnnnnnnnnnnnn' },
      'wwwwwwwwwwwwwwwwwwwwww',
    );
    expect(captured[0].headers[NEW_EDIT_TOKEN_HEADER]).toBe('wwwwwwwwwwwwwwwwwwwwww');
  });

  test('lost CAS race carries the remote state for merging', async () => {
    const conflict = fake(409, {
      error: 'version_conflict',
      version: 7,
      blob_view: 'RV',
      blob_priv: 'RP',
    });
    expect(
      await failure(new HatchClient('https://s', conflict.fetch).put(LOC, TOKEN, 4, BODY)),
    ).toEqual({ kind: 'conflict', remote: { blob_view: 'RV', blob_priv: 'RP', version: 7 } });
  });

  test('re-key collision is locator_taken, distinct from the CAS conflict', async () => {
    const taken = fake(409, { error: 'locator_taken' });
    expect(
      await failure(new HatchClient('https://s', taken.fetch).put(LOC, TOKEN, 4, BODY)),
    ).toEqual({ kind: 'locator_taken' });
  });

  test('auth and size failures', async () => {
    const bad = fake(401, { error: 'bad_token' });
    expect(await failure(new HatchClient('https://s', bad.fetch).put(LOC, TOKEN, 4, BODY))).toEqual(
      {
        kind: 'bad_token',
      },
    );
    const big = fake(413, { error: 'too_large' });
    expect(await failure(new HatchClient('https://s', big.fetch).put(LOC, TOKEN, 4, BODY))).toEqual(
      {
        kind: 'too_large',
      },
    );
  });
});

describe('HatchClient.remove and health', () => {
  test('remove is idempotent: 404 counts as success', async () => {
    await new HatchClient('https://s', fake(204).fetch).remove(LOC, TOKEN);
    await new HatchClient('https://s', fake(404, { error: 'not_found' }).fetch).remove(LOC, TOKEN);
    const bad = fake(401, { error: 'bad_token' });
    expect(await failure(new HatchClient('https://s', bad.fetch).remove(LOC, TOKEN))).toEqual({
      kind: 'bad_token',
    });
  });

  test('health is a boolean, never a throw', async () => {
    expect(await new HatchClient('https://s', fake(200, { ok: true }).fetch).health()).toBe(true);
    expect(await new HatchClient('https://s', fake(500).fetch).health()).toBe(false);
    const dead = (async () => {
      throw new TypeError('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await new HatchClient('https://s', dead).health()).toBe(false);
  });

  test('network failures wrap the cause; base URL slash is normalized', async () => {
    const cause = new TypeError('offline');
    const dead = (async () => {
      throw cause;
    }) as unknown as typeof fetch;
    const got = await failure(new HatchClient('https://s/', dead).getView(LOC));
    expect(got).toEqual({ kind: 'network', cause });

    const { fetch, captured } = fake(200, { blob_view: 'V', version: 1 });
    await new HatchClient('https://s///', fetch).getView(LOC);
    expect(captured[0].url).toBe(`https://s/v2/profiles/view/${LOC}`);
  });
});

describe('HatchClient boops', () => {
  test('inbox create POSTs locator+token in the body (no header — token is registered, not proven)', async () => {
    const { fetch, captured } = fake(201);
    await new HatchClient('https://s', fetch).createBoopInbox(LOC, TOKEN);
    expect(captured[0]).toMatchObject({
      url: 'https://s/v2/boops',
      method: 'POST',
      body: { locator: LOC, token: TOKEN },
    });
  });

  test('postKnock is tokenless; full and throttled inboxes surface as their own kinds', async () => {
    const { fetch, captured } = fake(201);
    await new HatchClient('https://s', fetch).postKnock(LOC, 'SEALED');
    expect(captured[0].url).toBe(`https://s/v2/boops/${LOC}/knocks`);
    expect(captured[0].headers[BOOP_TOKEN_HEADER]).toBeUndefined();
    expect(captured[0].body).toEqual({ blob: 'SEALED' });

    const full = await failure(new HatchClient('https://s', fake(503).fetch).postKnock(LOC, 'X'));
    expect(full).toEqual({ kind: 'at_capacity' });
    const throttled = await failure(
      new HatchClient('https://s', fake(429).fetch).postKnock(LOC, 'X'),
    );
    expect(throttled).toEqual({ kind: 'rate_limited' });
  });

  test('listKnocks sends the owner token; a missing inbox is null (self-heal cue)', async () => {
    const knocks = [{ id: 'k', blob: 'B', created: 3600000 }];
    const { fetch, captured } = fake(200, { knocks });
    await expect(new HatchClient('https://s', fetch).listKnocks(LOC, TOKEN)).resolves.toEqual(
      knocks,
    );
    expect(captured[0].headers[BOOP_TOKEN_HEADER]).toBe(TOKEN);
    await expect(
      new HatchClient('https://s', fake(404).fetch).listKnocks(LOC, TOKEN),
    ).resolves.toBeNull();
  });

  test('knock and inbox deletes are idempotent on 404', async () => {
    const client404 = new HatchClient('https://s', fake(404).fetch);
    await expect(client404.deleteKnock(LOC, TOKEN, 'kid')).resolves.toBeUndefined();
    await expect(client404.deleteBoopInbox(LOC, TOKEN)).resolves.toBeUndefined();
    const { fetch, captured } = fake(200);
    await new HatchClient('https://s', fetch).deleteKnock(LOC, TOKEN, 'kid');
    expect(captured[0].url).toBe(`https://s/v2/boops/${LOC}/knocks/kid`);
    expect(captured[0].method).toBe('DELETE');
  });
});

/**
 * A HatchError's message is what a person reads in a toast, so it is part of
 * the product, not debug output. These shipped as `hatch network` and friends
 * for long enough to prove nobody was checking.
 */
describe('failure messages', () => {
  const ALL: HatchFailure[] = [
    { kind: 'network', cause: new Error('boom') },
    { kind: 'not_found' },
    { kind: 'bad_token' },
    { kind: 'conflict', remote: { version: 2, blob_view: 'V', blob_priv: 'P' } },
    { kind: 'locator_taken' },
    { kind: 'too_large' },
    { kind: 'rate_limited' },
    { kind: 'at_capacity' },
    { kind: 'server', status: 500 },
  ];

  test('every failure reads as a sentence, and none leaks the kind', () => {
    for (const failure of ALL) {
      const message = hatchFailureMessage(failure);
      expect(message).toMatch(/^[A-Z\u2018\u201cT]/);
      expect(message).toMatch(/[.]$/);
      // The machine tokens are snake_case to a one; none may reach a reader.
      expect(message).not.toContain('_');
    }
  });

  test('each failure says something different', () => {
    expect(new Set(ALL.map(hatchFailureMessage)).size).toBe(ALL.length);
  });

  test('the offline case names the cause and the consequence', () => {
    const message = hatchFailureMessage({ kind: 'network', cause: null });
    expect(message).toContain('offline');
    expect(message).toContain('Nothing was lost');
  });

  test('HatchError carries it as its own message', () => {
    expect(new HatchError({ kind: 'not_found' }).message).toBe(
      hatchFailureMessage({ kind: 'not_found' }),
    );
  });
});
