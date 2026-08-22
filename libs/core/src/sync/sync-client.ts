// Fetch-based sync client — framework-free (fetch is global in browsers and
// Node), unit-tested with an injected fake fetch.
import {
  WRITE_TOKEN_HEADER,
  type ApiError,
  type PutVaultRequest,
  type PutVaultResponse,
  type VaultRecord,
} from './sync-api';

export type SyncFailure =
  | { kind: 'network'; cause: unknown }
  | { kind: 'not_found' }
  | { kind: 'bad_token' }
  | { kind: 'conflict'; remote: VaultRecord }
  | { kind: 'too_large' }
  | { kind: 'rate_limited' }
  | { kind: 'server'; status: number };

export class SyncError extends Error {
  constructor(readonly failure: SyncFailure) {
    super(`sync ${failure.kind}`);
    this.name = 'SyncError';
  }
}

export class SyncClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  /** Vault ciphertext + version, or null when the server has none. */
  async get(locator: string): Promise<VaultRecord | null> {
    const res = await this.request(`/v1/vault/${locator}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as VaultRecord;
  }

  /**
   * Push a blob; `ifVersion` 0 creates. Resolves the new version. Throws
   * SyncError({kind:'conflict', remote}) carrying the server's current state.
   */
  async put(
    locator: string,
    writeToken: string,
    blob: string,
    ifVersion: number,
  ): Promise<number> {
    const body: PutVaultRequest = { blob };
    const res = await this.request(`/v1/vault/${locator}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [WRITE_TOKEN_HEADER]: writeToken,
        'if-match': String(ifVersion),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.toError(res);
    return ((await res.json()) as PutVaultResponse).version;
  }

  /** Idempotent: a 404 (already gone) counts as success. */
  async remove(locator: string, writeToken: string): Promise<void> {
    const res = await this.request(`/v1/vault/${locator}`, {
      method: 'DELETE',
      headers: { [WRITE_TOKEN_HEADER]: writeToken },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.request('/v1/health', { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(this.base + path, init);
    } catch (cause) {
      throw new SyncError({ kind: 'network', cause });
    }
  }

  private async toError(res: Response): Promise<SyncError> {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error body */
    }
    switch (res.status) {
      case 401:
        return new SyncError({ kind: 'bad_token' });
      case 404:
        return new SyncError({ kind: 'not_found' });
      case 409:
        return new SyncError({
          kind: 'conflict',
          remote: { blob: body?.blob ?? '', version: body?.version ?? 0 },
        });
      case 413:
        return new SyncError({ kind: 'too_large' });
      case 429:
        return new SyncError({ kind: 'rate_limited' });
      default:
        return new SyncError({ kind: 'server', status: res.status });
    }
  }
}
