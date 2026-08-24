// HTTP layer: routing, CORS, body caps, and the hatch error taxonomy.
// Framework-free — node:http request listener.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
  HATCH_BLOB_RE,
  HATCH_LOCATOR_RE,
  type HatchApiError,
  type HatchErrorCode,
} from '../libs/core/src/hatch/hatch-api.ts';
import {
  ADMIN_TOKEN_HEADER,
  MEMBER_TOKEN_HEADER,
  NEW_ADMIN_TOKEN_HEADER,
} from '../libs/core/src/group/group-api.ts';
import {
  METRICS_BUCKET_RE,
  METRICS_DEFAULT_K,
  METRICS_EPOCH_RE,
  METRICS_MAX_BUCKETS,
} from '../libs/core/src/metrics/metrics-api.ts';
import { BOOP_MAX_KNOCK_BYTES, BOOP_TOKEN_HEADER } from '../libs/core/src/boop/boop-api.ts';
import type { ProfilesDb } from './profiles-db.ts';
import type { GroupsDb } from './groups-db.ts';
import type { MetricsDb } from './metrics-db.ts';
import type { BoopsDb } from './boops-db.ts';
import { RateLimiter } from './rate-limit.ts';

export interface AppOptions {
  profiles: ProfilesDb;
  groups: GroupsDb;
  metrics: MetricsDb;
  boops: BoopsDb;
  maxBlobBytes: number;
  trustProxy: boolean;
  readsPerMinute?: number;
  writesPerMinute?: number;
  metricsPerMinute?: number;
  boopsPerMinute?: number;
  /** Circuit breaker: POST /v2/profiles answers 503 at_capacity beyond this. */
  maxProfiles?: number;
  /** Circuit breaker: POST /v2/groups answers 503 at_capacity beyond this. */
  maxGroups?: number;
  /** Circuit breaker: POST /v2/boops answers 503 at_capacity beyond this. */
  maxBoopInboxes?: number;
  /** k-floor: aggregate buckets under this count are never served. */
  metricsK?: number;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers':
    `content-type, if-match, ${EDIT_TOKEN_HEADER}, ${NEW_EDIT_TOKEN_HEADER}, ` +
    `${ADMIN_TOKEN_HEADER}, ${MEMBER_TOKEN_HEADER}, ${NEW_ADMIN_TOKEN_HEADER}, ` +
    `${BOOP_TOKEN_HEADER}`,
  'access-control-max-age': '86400',
} as const;

function send(res: ServerResponse, status: number, body?: unknown): void {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    ...(payload ? { 'content-type': 'application/json' } : {}),
  });
  res.end(payload);
}

function sendError(
  res: ServerResponse,
  status: number,
  error: HatchErrorCode,
  extra?: Partial<HatchApiError>,
): void {
  send(res, status, { error, ...extra } satisfies HatchApiError);
}

function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

async function readBody(req: IncomingMessage, cap: number): Promise<string | null> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > cap) return null;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > cap) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** UTC year-month, e.g. "2026-08" — the current metrics epoch. */
function serverEpoch(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createApp(opts: AppOptions) {
  const profiles = opts.profiles;
  const readLimiter = new RateLimiter(opts.readsPerMinute ?? 120);
  const writeLimiter = new RateLimiter(opts.writesPerMinute ?? 30);
  const metricsLimiter = new RateLimiter(opts.metricsPerMinute ?? 5);
  const boopLimiter = new RateLimiter(opts.boopsPerMinute ?? 5);
  // HTTP body cap: two blobs plus JSON framing.
  const bodyCap = opts.maxBlobBytes * 3;

  const validBlob = (blob: unknown): blob is string =>
    typeof blob === 'string' &&
    HATCH_BLOB_RE.test(blob) &&
    Buffer.byteLength(blob, 'utf8') <= opts.maxBlobBytes;

  /** Header token → SHA-256 hex, or null if missing/malformed. */
  const tokenHashFrom = (req: IncomingMessage, header: string): string | null => {
    const token = req.headers[header];
    if (typeof token !== 'string' || !HATCH_LOCATOR_RE.test(token)) return null;
    return createHash('sha256').update(token, 'utf8').digest('hex');
  };

  /** Capped JSON body, or null after answering 413/400 itself. */
  const readJson = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<Record<string, unknown> | null> => {
    const raw = await readBody(req, bodyCap);
    if (raw === null) {
      sendError(res, 413, 'too_large');
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== 'object') throw new Error('not an object');
      return parsed as Record<string, unknown>;
    } catch {
      sendError(res, 400, 'bad_request', { message: 'body must be a JSON object' });
      return null;
    }
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://internal');
      const method = req.method ?? 'GET';
      const pathname = url.pathname;

      if (method === 'OPTIONS') {
        send(res, 204);
        return;
      }
      if (pathname === '/v2/health' && method === 'GET') {
        send(res, 200, { ok: true });
        return;
      }

      const key = clientKey(req, opts.trustProxy);

      // POST /v2/metrics — opt-in anonymous counters, on its own (tight)
      // rate bucket so submissions never contend with profile saves.
      if (pathname === '/v2/metrics' && method === 'POST') {
        if (!metricsLimiter.take(key)) {
          res.setHeader('retry-after', '60');
          sendError(res, 429, 'rate_limited');
          return;
        }
        const body = await readJson(req, res);
        if (!body) return;
        const epoch = body['epoch'];
        const token = body['token'];
        const buckets = body['buckets'];
        if (typeof epoch !== 'string' || epoch !== serverEpoch()) {
          sendError(res, 400, 'bad_request', { message: 'epoch must be the current UTC month' });
          return;
        }
        if (typeof token !== 'string' || !HATCH_LOCATOR_RE.test(token)) {
          sendError(res, 400, 'bad_request', { message: 'malformed token' });
          return;
        }
        if (
          !Array.isArray(buckets) ||
          buckets.length === 0 ||
          buckets.length > METRICS_MAX_BUCKETS ||
          !buckets.every((b) => typeof b === 'string' && METRICS_BUCKET_RE.test(b))
        ) {
          sendError(res, 400, 'bad_request', { message: 'malformed buckets' });
          return;
        }
        const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
        const outcome = opts.metrics.submit(epoch, tokenHash, buckets as string[]);
        if (outcome === 'ok') send(res, 201, { ok: true });
        else sendError(res, 409, 'version_conflict', { message: 'already submitted this epoch' });
        return;
      }

      // POST /v2/boops/:locator/knocks — anonymous sealed drop, on its own
      // tight rate bucket. No token: holding the locator (which travels only
      // inside encrypted payloads) is the capability to knock. The server
      // stores an opaque blob; what it unavoidably learns is that this inbox
      // received a knock now — and a 503 here tells any locator holder the
      // inbox is full, an accepted leak. A per-inbox arrival throttle in the
      // DB backs up the per-IP bucket.
      const knockMatch = pathname.match(/^\/v2\/boops\/([^/]+)\/knocks$/);
      if (knockMatch && method === 'POST') {
        if (!boopLimiter.take(key)) {
          res.setHeader('retry-after', '60');
          sendError(res, 429, 'rate_limited');
          return;
        }
        if (!HATCH_LOCATOR_RE.test(knockMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        const body = await readJson(req, res);
        if (!body) return;
        const blob = body['blob'];
        // Knocks get their own tight byte cap: clients pad every sealed
        // knock to one fixed bucket, so anything bigger is malformed anyway.
        if (
          typeof blob !== 'string' ||
          !HATCH_BLOB_RE.test(blob) ||
          Buffer.byteLength(blob, 'utf8') > BOOP_MAX_KNOCK_BYTES
        ) {
          sendError(res, 400, 'bad_request', { message: 'blob must be base64url' });
          return;
        }
        const outcome = opts.boops.addKnock(knockMatch[1], blob);
        if (outcome === 'added') send(res, 201, { ok: true });
        else if (outcome === 'not_found') sendError(res, 404, 'not_found');
        else if (outcome === 'full') sendError(res, 503, 'at_capacity');
        else {
          res.setHeader('retry-after', '3600');
          sendError(res, 429, 'rate_limited');
        }
        return;
      }

      const limiter = method === 'GET' ? readLimiter : writeLimiter;
      if (!limiter.take(key)) {
        res.setHeader('retry-after', '60');
        sendError(res, 429, 'rate_limited');
        return;
      }

      // GET /v2/metrics/:epoch — the k-floored public aggregate.
      const metricsMatch = pathname.match(/^\/v2\/metrics\/([^/]+)$/);
      if (metricsMatch && method === 'GET') {
        if (!METRICS_EPOCH_RE.test(metricsMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed epoch' });
          return;
        }
        res.setHeader('cache-control', 'public, max-age=300');
        send(res, 200, {
          epoch: metricsMatch[1],
          buckets: opts.metrics.get(metricsMatch[1], opts.metricsK ?? METRICS_DEFAULT_K),
        });
        return;
      }

      // POST /v2/profiles — hatch. Locators are client-derived; a collision
      // means the phrase is taken (astronomically unlikely) and the client
      // remints. INSERT ON CONFLICT leaves no pre-registration window to
      // squat.
      if (pathname === '/v2/profiles' && method === 'POST') {
        if (opts.maxProfiles !== undefined && profiles.count() >= opts.maxProfiles) {
          sendError(res, 503, 'at_capacity');
          return;
        }
        const tokenHash = tokenHashFrom(req, EDIT_TOKEN_HEADER);
        if (!tokenHash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
          return;
        }
        const raw = await readBody(req, bodyCap);
        if (raw === null) {
          sendError(res, 413, 'too_large');
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          sendError(res, 400, 'bad_request', { message: 'body must be JSON' });
          return;
        }
        const viewLocator = body['view_locator'];
        const editLocator = body['edit_locator'];
        if (
          typeof viewLocator !== 'string' ||
          !HATCH_LOCATOR_RE.test(viewLocator) ||
          typeof editLocator !== 'string' ||
          !HATCH_LOCATOR_RE.test(editLocator) ||
          viewLocator === editLocator
        ) {
          sendError(res, 400, 'bad_request', { message: 'malformed locators' });
          return;
        }
        if (!validBlob(body['blob_view']) || !validBlob(body['blob_priv'])) {
          sendError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
          return;
        }
        const outcome = profiles.create(
          viewLocator,
          editLocator,
          tokenHash,
          body['blob_view'],
          body['blob_priv'],
        );
        if (outcome === 'created') send(res, 201, { version: 1 });
        else sendError(res, 409, 'locator_taken');
        return;
      }

      const viewMatch = pathname.match(/^\/v2\/profiles\/view\/([^/]+)$/);
      if (viewMatch && method === 'GET') {
        if (!HATCH_LOCATOR_RE.test(viewMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        const record = profiles.getView(viewMatch[1]);
        if (!record) sendError(res, 404, 'not_found');
        else send(res, 200, record);
        return;
      }

      // POST /v2/boops — register an inbox. Locator AND token are random,
      // client-minted, and travel in the JSON body: the token is being
      // registered here, not proven. Nothing links an inbox row to a profile
      // row server-side — though a sender registering a reply box and then
      // knocking on another inbox seconds later hands the server a timing
      // correlation (clients jitter the pair to soften it).
      if (pathname === '/v2/boops' && method === 'POST') {
        if (opts.maxBoopInboxes !== undefined && opts.boops.count() >= opts.maxBoopInboxes) {
          sendError(res, 503, 'at_capacity');
          return;
        }
        const body = await readJson(req, res);
        if (!body) return;
        const locator = body['locator'];
        const token = body['token'];
        if (
          typeof locator !== 'string' ||
          !HATCH_LOCATOR_RE.test(locator) ||
          typeof token !== 'string' ||
          !HATCH_LOCATOR_RE.test(token)
        ) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator or token' });
          return;
        }
        const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
        const outcome = opts.boops.createInbox(locator, tokenHash);
        if (outcome === 'created') send(res, 201, { ok: true });
        else sendError(res, 409, 'locator_taken');
        return;
      }

      // /v2/boops/:locator/knocks/:id — the owner deletes one knock.
      const knockDeleteMatch = pathname.match(/^\/v2\/boops\/([^/]+)\/knocks\/([^/]+)$/);
      if (knockDeleteMatch && method === 'DELETE') {
        if (!HATCH_LOCATOR_RE.test(knockDeleteMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        const hash = tokenHashFrom(req, BOOP_TOKEN_HEADER);
        if (!hash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed boop token' });
          return;
        }
        const outcome = opts.boops.deleteKnock(knockDeleteMatch[1], hash, knockDeleteMatch[2]);
        if (outcome === 'deleted') send(res, 200, { ok: true });
        else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
        else sendError(res, 404, 'not_found');
        return;
      }

      // /v2/boops/:locator — the owner polls (bumping the idle-GC clock) or
      // tears the inbox down (rotation, profile deletion, answered box).
      const boopMatch = pathname.match(/^\/v2\/boops\/([^/]+)$/);
      if (boopMatch) {
        if (!HATCH_LOCATOR_RE.test(boopMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        const hash = tokenHashFrom(req, BOOP_TOKEN_HEADER);
        if (!hash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed boop token' });
          return;
        }
        if (method === 'GET') {
          const outcome = opts.boops.list(boopMatch[1], hash);
          if (outcome.status === 'ok') send(res, 200, { knocks: outcome.knocks });
          else if (outcome.status === 'bad_token') sendError(res, 401, 'bad_token');
          else sendError(res, 404, 'not_found');
          return;
        }
        if (method === 'DELETE') {
          const outcome = opts.boops.deleteInbox(boopMatch[1], hash);
          if (outcome === 'deleted') send(res, 200, { ok: true });
          else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
          else sendError(res, 404, 'not_found');
          return;
        }
        sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
        return;
      }

      // POST /v2/groups — create a roster. Locator is client-derived from
      // the group phrase; the admin token comes from the creator's separate
      // admin phrase.
      if (pathname === '/v2/groups' && method === 'POST') {
        if (opts.maxGroups !== undefined && opts.groups.count() >= opts.maxGroups) {
          sendError(res, 503, 'at_capacity');
          return;
        }
        const adminHash = tokenHashFrom(req, ADMIN_TOKEN_HEADER);
        if (!adminHash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed admin token' });
          return;
        }
        const body = await readJson(req, res);
        if (!body) return;
        const groupLocator = body['group_locator'];
        if (typeof groupLocator !== 'string' || !HATCH_LOCATOR_RE.test(groupLocator)) {
          sendError(res, 400, 'bad_request', { message: 'malformed group locator' });
          return;
        }
        if (!validBlob(body['blob_meta'])) {
          sendError(res, 400, 'bad_request', { message: 'blob_meta must be base64url' });
          return;
        }
        const outcome = opts.groups.create(groupLocator, adminHash, body['blob_meta']);
        if (outcome === 'created') send(res, 201, { version: 1 });
        else sendError(res, 409, 'locator_taken');
        return;
      }

      // POST /v2/groups/:g/members — join: deposit a member blob under a
      // random member locator; its token (hashed here) is the member's own
      // update/leave capability.
      const joinMatch = pathname.match(/^\/v2\/groups\/([^/]+)\/members$/);
      if (joinMatch && method === 'POST') {
        if (!HATCH_LOCATOR_RE.test(joinMatch[1])) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        const memberHash = tokenHashFrom(req, MEMBER_TOKEN_HEADER);
        if (!memberHash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed member token' });
          return;
        }
        const body = await readJson(req, res);
        if (!body) return;
        const memberLocator = body['member_locator'];
        if (typeof memberLocator !== 'string' || !HATCH_LOCATOR_RE.test(memberLocator)) {
          sendError(res, 400, 'bad_request', { message: 'malformed member locator' });
          return;
        }
        if (!validBlob(body['blob_member'])) {
          sendError(res, 400, 'bad_request', { message: 'blob_member must be base64url' });
          return;
        }
        const outcome = opts.groups.join(joinMatch[1], memberLocator, memberHash, body['blob_member']);
        if (outcome === 'joined') send(res, 201, { version: 1 });
        else if (outcome === 'group_not_found') sendError(res, 404, 'not_found');
        else if (outcome === 'full') sendError(res, 503, 'at_capacity');
        else sendError(res, 409, 'locator_taken');
        return;
      }

      // /v2/groups/:g/members/:m — a member updates or removes their own
      // deposit (member token); an admin token may also remove it (kick).
      const memberMatch = pathname.match(/^\/v2\/groups\/([^/]+)\/members\/([^/]+)$/);
      if (memberMatch) {
        const memberLocator = memberMatch[2];
        if (!HATCH_LOCATOR_RE.test(memberMatch[1]) || !HATCH_LOCATOR_RE.test(memberLocator)) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        if (method === 'DELETE') {
          const hash =
            tokenHashFrom(req, MEMBER_TOKEN_HEADER) ?? tokenHashFrom(req, ADMIN_TOKEN_HEADER);
          if (!hash) {
            sendError(res, 400, 'bad_request', { message: 'missing member or admin token' });
            return;
          }
          const outcome = opts.groups.deleteMember(memberLocator, hash);
          if (outcome === 'deleted') send(res, 204);
          else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
          else sendError(res, 404, 'not_found');
          return;
        }
        if (method === 'PUT') {
          const memberHash = tokenHashFrom(req, MEMBER_TOKEN_HEADER);
          if (!memberHash) {
            sendError(res, 400, 'bad_request', { message: 'missing or malformed member token' });
            return;
          }
          const ifVersion = Number(req.headers['if-match']);
          if (!Number.isInteger(ifVersion) || ifVersion < 1) {
            sendError(res, 400, 'bad_request', { message: 'If-Match must be a positive integer' });
            return;
          }
          const body = await readJson(req, res);
          if (!body) return;
          if (!validBlob(body['blob_member'])) {
            sendError(res, 400, 'bad_request', { message: 'blob_member must be base64url' });
            return;
          }
          const outcome = opts.groups.putMember(memberLocator, memberHash, ifVersion, body['blob_member']);
          if (outcome === 'updated') send(res, 200, { version: ifVersion + 1 });
          else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
          else if (outcome === 'conflict') sendError(res, 409, 'version_conflict');
          else sendError(res, 404, 'not_found');
          return;
        }
        sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
        return;
      }

      // /v2/groups/:g — read the roster (the locator is the capability),
      // or admin-update / admin-delete it.
      const groupMatch = pathname.match(/^\/v2\/groups\/([^/]+)$/);
      if (groupMatch) {
        const groupLocator = groupMatch[1];
        if (!HATCH_LOCATOR_RE.test(groupLocator)) {
          sendError(res, 400, 'bad_request', { message: 'malformed locator' });
          return;
        }
        if (method === 'GET') {
          const record = opts.groups.get(groupLocator);
          if (!record) sendError(res, 404, 'not_found');
          else send(res, 200, record);
          return;
        }
        const adminHash = tokenHashFrom(req, ADMIN_TOKEN_HEADER);
        if (!adminHash) {
          sendError(res, 400, 'bad_request', { message: 'missing or malformed admin token' });
          return;
        }
        if (method === 'DELETE') {
          const outcome = opts.groups.delete(groupLocator, adminHash);
          if (outcome === 'deleted') send(res, 204);
          else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
          else sendError(res, 404, 'not_found');
          return;
        }
        if (method === 'PUT') {
          const ifVersion = Number(req.headers['if-match']);
          if (!Number.isInteger(ifVersion) || ifVersion < 1) {
            sendError(res, 400, 'bad_request', { message: 'If-Match must be a positive integer' });
            return;
          }
          const body = await readJson(req, res);
          if (!body) return;
          if (!validBlob(body['blob_meta'])) {
            sendError(res, 400, 'bad_request', { message: 'blob_meta must be base64url' });
            return;
          }
          const newGroupLocator = body['new_group_locator'];
          let newAdminTokenHash: string | undefined;
          if (newGroupLocator !== undefined) {
            if (typeof newGroupLocator !== 'string' || !HATCH_LOCATOR_RE.test(newGroupLocator)) {
              sendError(res, 400, 'bad_request', { message: 'malformed new_group_locator' });
              return;
            }
            const hash = tokenHashFrom(req, NEW_ADMIN_TOKEN_HEADER);
            if (!hash) {
              sendError(res, 400, 'bad_request', {
                message: `new_group_locator requires ${NEW_ADMIN_TOKEN_HEADER}`,
              });
              return;
            }
            newAdminTokenHash = hash;
          }
          const outcome = opts.groups.put(groupLocator, adminHash, ifVersion, {
            blob_meta: body['blob_meta'],
            newGroupLocator: newGroupLocator as string | undefined,
            newAdminTokenHash,
          });
          switch (outcome.status) {
            case 'updated':
              send(res, 200, { version: outcome.version });
              return;
            case 'conflict':
              sendError(res, 409, 'version_conflict', {
                version: outcome.version,
                blob_view: outcome.blob_meta,
              });
              return;
            case 'bad_token':
              sendError(res, 401, 'bad_token');
              return;
            case 'not_found':
              sendError(res, 404, 'not_found');
              return;
            case 'locator_taken':
              sendError(res, 409, 'locator_taken');
              return;
          }
        }
        sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
        return;
      }

      const editMatch = pathname.match(/^\/v2\/profiles\/edit\/([^/]+)$/);
      if (!editMatch) {
        sendError(res, 404, 'not_found');
        return;
      }
      const editLocator = editMatch[1];
      if (!HATCH_LOCATOR_RE.test(editLocator)) {
        sendError(res, 400, 'bad_request', { message: 'malformed locator' });
        return;
      }

      // The edit locator is itself a capability (128-bit, derived from the
      // edit phrase); reads need no token — the blobs are ciphertext anyway.
      if (method === 'GET') {
        const record = profiles.getEdit(editLocator);
        if (!record) sendError(res, 404, 'not_found');
        else send(res, 200, record);
        return;
      }

      const tokenHash = tokenHashFrom(req, EDIT_TOKEN_HEADER);
      if (!tokenHash) {
        sendError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
        return;
      }

      if (method === 'DELETE') {
        const outcome = profiles.delete(editLocator, tokenHash);
        if (outcome === 'deleted') send(res, 204);
        else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
        else sendError(res, 404, 'not_found');
        return;
      }

      if (method === 'PUT') {
        const ifMatchRaw = req.headers['if-match'];
        const ifVersion = Number(ifMatchRaw);
        if (typeof ifMatchRaw !== 'string' || !Number.isInteger(ifVersion) || ifVersion < 1) {
          sendError(res, 400, 'bad_request', { message: 'If-Match must be a positive integer' });
          return;
        }
        const raw = await readBody(req, bodyCap);
        if (raw === null) {
          sendError(res, 413, 'too_large');
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          sendError(res, 400, 'bad_request', { message: 'body must be JSON' });
          return;
        }
        if (!validBlob(body['blob_view']) || !validBlob(body['blob_priv'])) {
          sendError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
          return;
        }
        if (typeof body['populated'] !== 'boolean') {
          sendError(res, 400, 'bad_request', { message: 'populated must be boolean' });
          return;
        }
        const newViewLocator = body['new_view_locator'];
        if (
          newViewLocator !== undefined &&
          (typeof newViewLocator !== 'string' || !HATCH_LOCATOR_RE.test(newViewLocator))
        ) {
          sendError(res, 400, 'bad_request', { message: 'malformed new_view_locator' });
          return;
        }
        const newEditLocator = body['new_edit_locator'];
        let newEditTokenHash: string | undefined;
        if (newEditLocator !== undefined) {
          if (typeof newEditLocator !== 'string' || !HATCH_LOCATOR_RE.test(newEditLocator)) {
            sendError(res, 400, 'bad_request', { message: 'malformed new_edit_locator' });
            return;
          }
          // A new edit identity is a locator + token pair; both derive from
          // the new phrase, so both must arrive together.
          const hash = tokenHashFrom(req, NEW_EDIT_TOKEN_HEADER);
          if (!hash) {
            sendError(res, 400, 'bad_request', {
              message: `new_edit_locator requires ${NEW_EDIT_TOKEN_HEADER}`,
            });
            return;
          }
          newEditTokenHash = hash;
        }

        const outcome = profiles.put(editLocator, tokenHash, ifVersion, {
          blob_view: body['blob_view'],
          blob_priv: body['blob_priv'],
          populated: body['populated'],
          newViewLocator: newViewLocator as string | undefined,
          newEditLocator: newEditLocator as string | undefined,
          newEditTokenHash,
        });
        switch (outcome.status) {
          case 'updated':
            send(res, 200, { version: outcome.version });
            return;
          case 'conflict':
            sendError(res, 409, 'version_conflict', {
              version: outcome.version,
              blob_view: outcome.blob_view,
              blob_priv: outcome.blob_priv,
            });
            return;
          case 'bad_token':
            sendError(res, 401, 'bad_token');
            return;
          case 'not_found':
            sendError(res, 404, 'not_found');
            return;
          case 'locator_taken':
            sendError(res, 409, 'locator_taken');
            return;
        }
      }

      sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
    } catch {
      sendError(res, 500, 'bad_request', { message: 'internal error' });
    }
  };
}
