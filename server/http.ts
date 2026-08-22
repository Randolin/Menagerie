// HTTP layer: routing, CORS, body caps, and the error taxonomy from
// sync-api.ts. Framework-free — node:http request listener.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import {
  BLOB_RE,
  LOCATOR_RE,
  WRITE_TOKEN_HEADER,
  type ApiError,
  type ApiErrorCode,
} from '../libs/core/src/sync/sync-api.ts';
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
  HATCH_BLOB_RE,
  HATCH_LOCATOR_RE,
  type HatchApiError,
  type HatchErrorCode,
} from '../libs/core/src/hatch/hatch-api.ts';
import type { VaultDb } from './db.ts';
import type { ProfilesDb } from './profiles-db.ts';
import { RateLimiter } from './rate-limit.ts';

export interface AppOptions {
  maxBlobBytes: number;
  trustProxy: boolean;
  readsPerMinute?: number;
  writesPerMinute?: number;
  /** v2 hatch routes activate when a profiles DB is provided. */
  profiles?: ProfilesDb;
  /** Circuit breaker: POST /v2/profiles answers 503 at_capacity beyond this. */
  maxProfiles?: number;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': `content-type, ${WRITE_TOKEN_HEADER}, if-match, ${EDIT_TOKEN_HEADER}, ${NEW_EDIT_TOKEN_HEADER}`,
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

function sendError(res: ServerResponse, status: number, error: ApiErrorCode, extra?: Partial<ApiError>): void {
  send(res, status, { error, ...extra } satisfies ApiError);
}

function sendHatchError(
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

export function createApp(db: VaultDb, opts: AppOptions) {
  const readLimiter = new RateLimiter(opts.readsPerMinute ?? 120);
  const writeLimiter = new RateLimiter(opts.writesPerMinute ?? 30);
  // HTTP body cap: JSON framing overhead on top of the blob cap.
  const bodyCap = opts.maxBlobBytes * 2;
  // Hatch bodies carry two blobs.
  const hatchBodyCap = opts.maxBlobBytes * 3;

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

  async function handleV2(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    method: string,
  ): Promise<void> {
    if (pathname === '/v2/health' && method === 'GET') {
      send(res, 200, { ok: true });
      return;
    }
    const profiles = opts.profiles;
    if (!profiles) {
      sendHatchError(res, 404, 'not_found');
      return;
    }

    const key = clientKey(req, opts.trustProxy);
    const limiter = method === 'GET' ? readLimiter : writeLimiter;
    if (!limiter.take(key)) {
      res.setHeader('retry-after', '60');
      sendHatchError(res, 429, 'rate_limited');
      return;
    }

    // POST /v2/profiles — hatch. Locators are client-derived; a collision
    // means the phrase is taken (astronomically unlikely) and the client
    // remints. INSERT ON CONFLICT leaves no pre-registration window to squat.
    if (pathname === '/v2/profiles' && method === 'POST') {
      if (opts.maxProfiles !== undefined && profiles.count() >= opts.maxProfiles) {
        sendHatchError(res, 503, 'at_capacity');
        return;
      }
      const tokenHash = tokenHashFrom(req, EDIT_TOKEN_HEADER);
      if (!tokenHash) {
        sendHatchError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
        return;
      }
      const raw = await readBody(req, hatchBodyCap);
      if (raw === null) {
        sendHatchError(res, 413, 'too_large');
        return;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendHatchError(res, 400, 'bad_request', { message: 'body must be JSON' });
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
        sendHatchError(res, 400, 'bad_request', { message: 'malformed locators' });
        return;
      }
      if (!validBlob(body['blob_view']) || !validBlob(body['blob_priv'])) {
        sendHatchError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
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
      else sendHatchError(res, 409, 'locator_taken');
      return;
    }

    const viewMatch = pathname.match(/^\/v2\/profiles\/view\/([^/]+)$/);
    if (viewMatch && method === 'GET') {
      if (!HATCH_LOCATOR_RE.test(viewMatch[1])) {
        sendHatchError(res, 400, 'bad_request', { message: 'malformed locator' });
        return;
      }
      const record = profiles.getView(viewMatch[1]);
      if (!record) sendHatchError(res, 404, 'not_found');
      else send(res, 200, record);
      return;
    }

    const editMatch = pathname.match(/^\/v2\/profiles\/edit\/([^/]+)$/);
    if (!editMatch) {
      sendHatchError(res, 404, 'not_found');
      return;
    }
    const editLocator = editMatch[1];
    if (!HATCH_LOCATOR_RE.test(editLocator)) {
      sendHatchError(res, 400, 'bad_request', { message: 'malformed locator' });
      return;
    }

    // The edit locator is itself a capability (128-bit, derived from the edit
    // phrase); reads need no token — the blobs are ciphertext anyway.
    if (method === 'GET') {
      const record = profiles.getEdit(editLocator);
      if (!record) sendHatchError(res, 404, 'not_found');
      else send(res, 200, record);
      return;
    }

    const tokenHash = tokenHashFrom(req, EDIT_TOKEN_HEADER);
    if (!tokenHash) {
      sendHatchError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
      return;
    }

    if (method === 'DELETE') {
      const outcome = profiles.delete(editLocator, tokenHash);
      if (outcome === 'deleted') send(res, 204);
      else if (outcome === 'bad_token') sendHatchError(res, 401, 'bad_token');
      else sendHatchError(res, 404, 'not_found');
      return;
    }

    if (method === 'PUT') {
      const ifMatchRaw = req.headers['if-match'];
      const ifVersion = Number(ifMatchRaw);
      if (typeof ifMatchRaw !== 'string' || !Number.isInteger(ifVersion) || ifVersion < 1) {
        sendHatchError(res, 400, 'bad_request', { message: 'If-Match must be a positive integer' });
        return;
      }
      const raw = await readBody(req, hatchBodyCap);
      if (raw === null) {
        sendHatchError(res, 413, 'too_large');
        return;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendHatchError(res, 400, 'bad_request', { message: 'body must be JSON' });
        return;
      }
      if (!validBlob(body['blob_view']) || !validBlob(body['blob_priv'])) {
        sendHatchError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
        return;
      }
      if (typeof body['populated'] !== 'boolean') {
        sendHatchError(res, 400, 'bad_request', { message: 'populated must be boolean' });
        return;
      }
      const newViewLocator = body['new_view_locator'];
      if (newViewLocator !== undefined && (typeof newViewLocator !== 'string' || !HATCH_LOCATOR_RE.test(newViewLocator))) {
        sendHatchError(res, 400, 'bad_request', { message: 'malformed new_view_locator' });
        return;
      }
      const newEditLocator = body['new_edit_locator'];
      let newEditTokenHash: string | undefined;
      if (newEditLocator !== undefined) {
        if (typeof newEditLocator !== 'string' || !HATCH_LOCATOR_RE.test(newEditLocator)) {
          sendHatchError(res, 400, 'bad_request', { message: 'malformed new_edit_locator' });
          return;
        }
        // A new edit identity is a locator + token pair; both derive from the
        // new phrase, so both must arrive together.
        const hash = tokenHashFrom(req, NEW_EDIT_TOKEN_HEADER);
        if (!hash) {
          sendHatchError(res, 400, 'bad_request', {
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
          sendHatchError(res, 409, 'version_conflict', {
            version: outcome.version,
            blob_view: outcome.blob_view,
            blob_priv: outcome.blob_priv,
          });
          return;
        case 'bad_token':
          sendHatchError(res, 401, 'bad_token');
          return;
        case 'not_found':
          sendHatchError(res, 404, 'not_found');
          return;
        case 'locator_taken':
          sendHatchError(res, 409, 'locator_taken');
          return;
      }
    }

    sendHatchError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://internal');
      const method = req.method ?? 'GET';

      if (method === 'OPTIONS') {
        send(res, 204);
        return;
      }
      if (url.pathname === '/v1/health' && method === 'GET') {
        send(res, 200, { ok: true });
        return;
      }

      if (url.pathname.startsWith('/v2/')) {
        await handleV2(req, res, url.pathname, method);
        return;
      }

      const match = url.pathname.match(/^\/v1\/vault\/([^/]+)$/);
      if (!match) {
        sendError(res, 404, 'not_found');
        return;
      }
      const locator = match[1];
      if (!LOCATOR_RE.test(locator)) {
        sendError(res, 400, 'bad_request', { message: 'malformed locator' });
        return;
      }

      const key = clientKey(req, opts.trustProxy);
      const limiter = method === 'GET' ? readLimiter : writeLimiter;
      if (!limiter.take(key)) {
        res.setHeader('retry-after', '60');
        sendError(res, 429, 'rate_limited');
        return;
      }

      if (method === 'GET') {
        const record = db.get(locator);
        if (!record) sendError(res, 404, 'not_found');
        else send(res, 200, record);
        return;
      }

      // Mutations need the write token; the DB stores only its SHA-256.
      const token = req.headers[WRITE_TOKEN_HEADER];
      if (typeof token !== 'string' || !LOCATOR_RE.test(token)) {
        sendError(res, 400, 'bad_request', { message: 'missing or malformed write token' });
        return;
      }
      const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');

      if (method === 'DELETE') {
        const outcome = db.delete(locator, tokenHash);
        if (outcome === 'deleted') send(res, 204);
        else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
        else sendError(res, 404, 'not_found');
        return;
      }

      if (method === 'PUT') {
        const ifMatchRaw = req.headers['if-match'];
        const ifVersion = Number(ifMatchRaw);
        if (typeof ifMatchRaw !== 'string' || !Number.isInteger(ifVersion) || ifVersion < 0) {
          sendError(res, 400, 'bad_request', { message: 'If-Match must be a non-negative integer' });
          return;
        }
        const raw = await readBody(req, bodyCap);
        if (raw === null) {
          sendError(res, 413, 'too_large');
          return;
        }
        let blob: unknown;
        try {
          blob = (JSON.parse(raw) as { blob?: unknown }).blob;
        } catch {
          sendError(res, 400, 'bad_request', { message: 'body must be JSON' });
          return;
        }
        if (typeof blob !== 'string' || !BLOB_RE.test(blob)) {
          sendError(res, 400, 'bad_request', { message: 'blob must be base64url' });
          return;
        }
        if (Buffer.byteLength(blob, 'utf8') > opts.maxBlobBytes) {
          sendError(res, 413, 'too_large');
          return;
        }

        const outcome = db.put(locator, tokenHash, blob, ifVersion);
        switch (outcome.status) {
          case 'created':
            send(res, 201, { version: outcome.version });
            return;
          case 'updated':
            send(res, 200, { version: outcome.version });
            return;
          case 'conflict':
            sendError(res, 409, 'version_conflict', {
              version: outcome.version,
              blob: outcome.blob,
            });
            return;
          case 'bad_token':
            sendError(res, 401, 'bad_token');
            return;
          case 'not_found':
            sendError(res, 404, 'not_found');
            return;
        }
      }

      sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
    } catch {
      sendError(res, 500, 'bad_request', { message: 'internal error' });
    }
  };
}
