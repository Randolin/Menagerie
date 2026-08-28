// Fetch-based client for the v2 hatch profile API — framework-free (fetch is
// global in browsers and Node), unit-tested with an injected fake fetch.
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
  type CreateProfileRequest,
  type EditRecord,
  type HatchApiError,
  type PutProfileRequest,
  type PutProfileResponse,
  type ViewRecord,
} from './hatch-api';
import {
  ADMIN_TOKEN_HEADER,
  MEMBER_TOKEN_HEADER,
  NEW_ADMIN_TOKEN_HEADER,
  type CreateGroupRequest,
  type GroupRecord,
  type JoinGroupRequest,
  type PutGroupRequest,
  type PutGroupResponse,
  type PutMemberResponse,
} from '../group/group-api';
import type { MetricsRecord, SubmitMetricsRequest } from '../metrics/metrics-api';
import { BOOP_TOKEN_HEADER, type BoopInboxRecord, type BoopKnockRecord } from '../boop/boop-api';
import { deriveViewKeys } from './keys';
import { decryptBlob } from './blob';
import { migrateToCurrent } from '../codec/migrate';
import type { ProfilePayload } from '../schema/types';

export type HatchFailure =
  | { kind: 'network'; cause: unknown }
  | { kind: 'not_found' }
  | { kind: 'bad_token' }
  /** CAS lost: the server's current state rides along for a client-side merge. */
  | {
      kind: 'conflict';
      remote: {
        version: number;
        blob_view: string;
        blob_priv: string;
        /** Present when the conflict was a group-meta or member-deposit PUT. */
        blob_meta?: string;
        blob_member?: string;
      };
    }
  /** The minted phrase's locator already names a row — remint and retry. */
  | { kind: 'locator_taken' }
  | { kind: 'too_large' }
  | { kind: 'rate_limited' }
  /** Creation circuit breaker tripped; the server is full, try later. */
  | { kind: 'at_capacity' }
  | { kind: 'server'; status: number };

export class HatchError extends Error {
  readonly failure: HatchFailure;

  constructor(failure: HatchFailure) {
    super(`hatch ${failure.kind}`);
    this.name = 'HatchError';
    this.failure = failure;
  }
}

export class HatchClient {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;

  constructor(baseUrl: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.fetchFn = fetchFn;
  }

  /**
   * Hatch: register a freshly minted profile. Throws
   * HatchError({kind:'locator_taken'}) when either locator collides — the
   * caller remints both phrases and tries again.
   */
  async create(request: CreateProfileRequest, editToken: string): Promise<void> {
    const res = await this.request('/v2/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [EDIT_TOKEN_HEADER]: editToken },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** Public read; null when no profile answers to the locator. */
  async getView(viewLocator: string): Promise<ViewRecord | null> {
    const res = await this.request(`/v2/profiles/view/${viewLocator}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as ViewRecord;
  }

  /** Edit-side read (locator is the capability); null when unknown. */
  async getEdit(editLocator: string): Promise<EditRecord | null> {
    const res = await this.request(`/v2/profiles/edit/${editLocator}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as EditRecord;
  }

  /**
   * CAS write; resolves the new version. When the request re-keys the edit
   * identity (`new_edit_locator`), the matching new token must ride along.
   * Throws HatchError({kind:'conflict', remote}) on a lost race.
   */
  async put(
    editLocator: string,
    editToken: string,
    ifVersion: number,
    request: PutProfileRequest,
    newEditToken?: string,
  ): Promise<number> {
    const res = await this.request(`/v2/profiles/edit/${editLocator}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [EDIT_TOKEN_HEADER]: editToken,
        'if-match': String(ifVersion),
        ...(newEditToken !== undefined ? { [NEW_EDIT_TOKEN_HEADER]: newEditToken } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
    return ((await res.json()) as PutProfileResponse).version;
  }

  /** Idempotent: a 404 (already gone) counts as success. */
  async remove(editLocator: string, editToken: string): Promise<void> {
    const res = await this.request(`/v2/profiles/edit/${editLocator}`, {
      method: 'DELETE',
      headers: { [EDIT_TOKEN_HEADER]: editToken },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  // ---- groups -------------------------------------------------------------

  /** Register a freshly minted group roster. locator_taken → remint. */
  async createGroup(request: CreateGroupRequest, adminToken: string): Promise<void> {
    const res = await this.request('/v2/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ADMIN_TOKEN_HEADER]: adminToken },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** Roster read (the locator is the capability); null when unknown. */
  async getGroup(groupLocator: string): Promise<GroupRecord | null> {
    const res = await this.request(`/v2/groups/${groupLocator}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as GroupRecord;
  }

  /** Admin CAS update; re-minting sends the new admin token alongside. */
  async putGroup(
    groupLocator: string,
    adminToken: string,
    ifVersion: number,
    request: PutGroupRequest,
    newAdminToken?: string,
  ): Promise<number> {
    const res = await this.request(`/v2/groups/${groupLocator}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [ADMIN_TOKEN_HEADER]: adminToken,
        'if-match': String(ifVersion),
        ...(newAdminToken !== undefined ? { [NEW_ADMIN_TOKEN_HEADER]: newAdminToken } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
    return ((await res.json()) as PutGroupResponse).version;
  }

  /** Idempotent admin delete (cascades deposits). */
  async removeGroup(groupLocator: string, adminToken: string): Promise<void> {
    const res = await this.request(`/v2/groups/${groupLocator}`, {
      method: 'DELETE',
      headers: { [ADMIN_TOKEN_HEADER]: adminToken },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  /** Deposit a member blob; the token is the member's own capability. */
  async joinGroup(
    groupLocator: string,
    memberToken: string,
    request: JoinGroupRequest,
  ): Promise<void> {
    const res = await this.request(`/v2/groups/${groupLocator}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [MEMBER_TOKEN_HEADER]: memberToken },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** Member CAS update of their own deposit. */
  async putMember(
    groupLocator: string,
    memberLocator: string,
    memberToken: string,
    ifVersion: number,
    blobMember: string,
  ): Promise<number> {
    const res = await this.request(`/v2/groups/${groupLocator}/members/${memberLocator}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [MEMBER_TOKEN_HEADER]: memberToken,
        'if-match': String(ifVersion),
      },
      body: JSON.stringify({ blob_member: blobMember }),
    });
    if (!res.ok) throw await this.toError(res);
    return ((await res.json()) as PutMemberResponse).version;
  }

  /** Leave (member token) or kick (admin token). Idempotent on 404. */
  async removeMember(
    groupLocator: string,
    memberLocator: string,
    token: string,
    as: 'member' | 'admin',
  ): Promise<void> {
    const header = as === 'member' ? MEMBER_TOKEN_HEADER : ADMIN_TOKEN_HEADER;
    const res = await this.request(`/v2/groups/${groupLocator}/members/${memberLocator}`, {
      method: 'DELETE',
      headers: { [header]: token },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  // ---- boops --------------------------------------------------------------

  /** Register a freshly minted inbox. locator_taken → the caller decides
   *  (a stored-token GET distinguishes "already mine" from a true clash). */
  async createBoopInbox(locator: string, token: string): Promise<void> {
    const res = await this.request('/v2/boops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locator, token }),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** Anonymous sealed drop; needs only the locator. 404 = inbox is gone
   *  (rotated away), 503 = full, 429 = arrival throttle. */
  async postKnock(locator: string, blob: string): Promise<void> {
    const res = await this.request(`/v2/boops/${locator}/knocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blob }),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** Owner poll; null when the inbox doesn't exist (self-heal by re-creating). */
  async listKnocks(locator: string, token: string): Promise<BoopKnockRecord[] | null> {
    const res = await this.request(`/v2/boops/${locator}`, {
      method: 'GET',
      headers: { [BOOP_TOKEN_HEADER]: token },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return ((await res.json()) as BoopInboxRecord).knocks;
  }

  /** Idempotent: a 404 (already gone) counts as success. */
  async deleteKnock(locator: string, token: string, id: string): Promise<void> {
    const res = await this.request(`/v2/boops/${locator}/knocks/${id}`, {
      method: 'DELETE',
      headers: { [BOOP_TOKEN_HEADER]: token },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  /** Idempotent inbox teardown (rotation, profile deletion, answered box). */
  async deleteBoopInbox(locator: string, token: string): Promise<void> {
    const res = await this.request(`/v2/boops/${locator}`, {
      method: 'DELETE',
      headers: { [BOOP_TOKEN_HEADER]: token },
    });
    if (res.status === 404 || res.ok) return;
    throw await this.toError(res);
  }

  // ---- metrics ------------------------------------------------------------

  /** Once-per-epoch counter submission. A 409 means "already counted". */
  async submitMetrics(request: SubmitMetricsRequest): Promise<void> {
    const res = await this.request('/v2/metrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw await this.toError(res);
  }

  /** The k-floored public aggregate for one epoch. */
  async getMetrics(epoch: string): Promise<MetricsRecord | null> {
    const res = await this.request(`/v2/metrics/${epoch}`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as MetricsRecord;
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.request('/v2/health', { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(this.base + path, init);
    } catch (cause) {
      throw new HatchError({ kind: 'network', cause });
    }
  }

  private async toError(res: Response): Promise<HatchError> {
    let body: HatchApiError | null = null;
    try {
      body = (await res.json()) as HatchApiError;
    } catch {
      /* non-JSON error body */
    }
    switch (res.status) {
      case 401:
        return new HatchError({ kind: 'bad_token' });
      case 404:
        return new HatchError({ kind: 'not_found' });
      case 409:
        // Two distinct 409s: a lost CAS race (carries state) vs. a locator
        // collision during create/re-key (remint and retry).
        if (body?.error === 'locator_taken') return new HatchError({ kind: 'locator_taken' });
        return new HatchError({
          kind: 'conflict',
          remote: {
            version: body?.version ?? 0,
            blob_view: body?.blob_view ?? '',
            blob_priv: body?.blob_priv ?? '',
            blob_meta: body?.blob_meta,
            blob_member: body?.blob_member,
          },
        });
      case 413:
        return new HatchError({ kind: 'too_large' });
      case 429:
        return new HatchError({ kind: 'rate_limited' });
      case 503:
        return new HatchError({ kind: 'at_capacity' });
      default:
        return new HatchError({ kind: 'server', status: res.status });
    }
  }
}

/** Everything one view fetch learned, for callers that want more than answers. */
export interface FetchedView {
  readonly payload: ProfilePayload;
  /** The derived locator — worth keeping, it cost an Argon2id pass. */
  readonly viewLocator: string;
  /** Save count, the same number freshness checks compare against. */
  readonly version: number;
}

/**
 * The one derive→fetch→decrypt→migrate pipeline every viewer shares. Null
 * when the server has no record (deleted, expired, or re-minted).
 */
export async function fetchView(
  client: HatchClient,
  viewPhrase: string,
): Promise<FetchedView | null> {
  const { viewLocator, viewKey } = await deriveViewKeys(viewPhrase);
  const record = await client.getView(viewLocator);
  if (!record) return null;
  return {
    payload: migrateToCurrent(await decryptBlob(record.blob_view, viewKey)),
    viewLocator,
    version: record.version,
  };
}

/** Just the answers, for the callers that want nothing else. */
export async function fetchViewPayload(
  client: HatchClient,
  viewPhrase: string,
): Promise<ProfilePayload | null> {
  return (await fetchView(client, viewPhrase))?.payload ?? null;
}

/**
 * How many times the profile behind a locator has been saved, or null when
 * nothing answers to it (deleted, expired, or re-minted). No key needed: the
 * version is metadata beside the ciphertext, so a viewer can tell that a
 * profile changed without being able to read a word of it.
 *
 * Takes a locator rather than a phrase so callers holding a cached one skip
 * the Argon2id derivation. The read still transfers the whole blob — the API
 * has no metadata-only route — so this is cheap in CPU, not in bytes.
 */
export async function fetchViewVersion(
  client: HatchClient,
  viewLocator: string,
): Promise<number | null> {
  const record = await client.getView(viewLocator);
  return record ? record.version : null;
}
