import { describe, expect, test } from 'vitest';
import { SyncClient, SyncError } from './sync-client';
import { WRITE_TOKEN_HEADER } from './sync-api';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SyncClient', () => {
  test('get: 200 record, 404 → null, trailing-slash base normalized', async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.endsWith('/v1/vault/aaaaaaaaaaaaaaaaaaaaaa')
        ? json(200, { blob: 'AA', version: 3 })
        : json(404, { error: 'not_found' }));
    const client = new SyncClient('http://x/', fn);
    expect(await client.get('aaaaaaaaaaaaaaaaaaaaaa')).toEqual({ blob: 'AA', version: 3 });
    expect(await client.get('bbbbbbbbbbbbbbbbbbbbbb')).toBeNull();
    expect(calls[0].url).toBe('http://x/v1/vault/aaaaaaaaaaaaaaaaaaaaaa');
  });

  test('put: sends token + if-match, resolves new version', async () => {
    const { fn, calls } = fakeFetch(() => json(200, { version: 7 }));
    const client = new SyncClient('http://x', fn);
    expect(await client.put('L'.repeat(22), 'T'.repeat(22), 'BLOB', 6)).toBe(7);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers[WRITE_TOKEN_HEADER]).toBe('T'.repeat(22));
    expect(headers['if-match']).toBe('6');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ blob: 'BLOB' });
  });

  test('put conflict carries the remote record', async () => {
    const { fn } = fakeFetch(() =>
      json(409, { error: 'version_conflict', version: 9, blob: 'REMOTE' }));
    const client = new SyncClient('http://x', fn);
    const err = await client.put('L'.repeat(22), 'T'.repeat(22), 'B', 1).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.failure).toEqual({ kind: 'conflict', remote: { blob: 'REMOTE', version: 9 } });
  });

  test('error taxonomy: 401/413/429/500 and network', async () => {
    const statuses: [number, string][] = [
      [401, 'bad_token'], [413, 'too_large'], [429, 'rate_limited'], [500, 'server'],
    ];
    for (const [status, kind] of statuses) {
      const { fn } = fakeFetch(() => json(status, { error: 'x' }));
      const err = await new SyncClient('http://x', fn)
        .put('L'.repeat(22), 'T'.repeat(22), 'B', 0).catch((e) => e);
      expect(err.failure.kind, String(status)).toBe(kind);
    }
    const { fn: dead } = fakeFetch(() => { throw new Error('offline'); });
    const err = await new SyncClient('http://x', dead).get('L'.repeat(22)).catch((e) => e);
    expect(err.failure.kind).toBe('network');
  });

  test('remove tolerates 404; health maps to boolean', async () => {
    const { fn } = fakeFetch(() => json(404, { error: 'not_found' }));
    await expect(new SyncClient('http://x', fn).remove('L'.repeat(22), 'T'.repeat(22)))
      .resolves.toBeUndefined();
    const { fn: ok } = fakeFetch(() => json(200, { ok: true }));
    expect(await new SyncClient('http://x', ok).health()).toBe(true);
    const { fn: down } = fakeFetch(() => { throw new Error('nope'); });
    expect(await new SyncClient('http://x', down).health()).toBe(false);
  });
});
