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
import type { VaultDb } from './db.ts';
import { RateLimiter } from './rate-limit.ts';

export interface AppOptions {
  maxBlobBytes: number;
  trustProxy: boolean;
  readsPerMinute?: number;
  writesPerMinute?: number;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': `content-type, ${WRITE_TOKEN_HEADER}, if-match`,
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
