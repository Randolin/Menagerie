// HTTP layer: the request dispatcher. Shared plumbing (CORS, response and
// body helpers, AppOptions/RouteContext) lives in http-util.ts; the per-
// domain handlers live in routes-*.ts. This file owns the two things that
// are order-sensitive and easy to get wrong when scattered: which routes
// run BEFORE the general rate limiter (the two anonymous writes with their
// own tight buckets), and the final 404 for anything no handler claims.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { HATCH_BLOB_RE, HATCH_LOCATOR_RE } from '../libs/core/src/hatch/hatch-api.ts';
import { RateLimiter } from './rate-limit.ts';
import {
  clientKey,
  readBody,
  send,
  sendError,
  type AppOptions,
  type RouteContext,
} from './http-util.ts';
import { handleProfiles } from './routes-profiles.ts';
import { handleGroups } from './routes-groups.ts';
import { handleBoops, handleKnockDrop } from './routes-boops.ts';
import { handleMetricsRead, handleMetricsSubmit } from './routes-metrics.ts';

export type { AppOptions } from './http-util.ts';

export function createApp(opts: AppOptions) {
  const readLimiter = new RateLimiter(opts.readsPerMinute ?? 120);
  const writeLimiter = new RateLimiter(opts.writesPerMinute ?? 30);
  // HTTP body cap: two blobs plus JSON framing.
  const bodyCap = opts.maxBlobBytes * 3;

  const ctx: RouteContext = {
    opts,
    metricsLimiter: new RateLimiter(opts.metricsPerMinute ?? 5),
    boopLimiter: new RateLimiter(opts.boopsPerMinute ?? 5),

    validBlob: (blob): blob is string =>
      typeof blob === 'string' &&
      HATCH_BLOB_RE.test(blob) &&
      Buffer.byteLength(blob, 'utf8') <= opts.maxBlobBytes,

    sha256Hex: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),

    tokenHashFrom: (req, header) => {
      const token = req.headers[header];
      if (typeof token !== 'string' || !HATCH_LOCATOR_RE.test(token)) return null;
      return ctx.sha256Hex(token);
    },

    parseIfMatch: (req, res) => {
      const raw = req.headers['if-match'];
      const version = Number(raw);
      if (typeof raw !== 'string' || !Number.isInteger(version) || version < 1) {
        sendError(res, 400, 'bad_request', { message: 'If-Match must be a positive integer' });
        return null;
      }
      return version;
    },

    readJson: async (req, res) => {
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
    },
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

      // The two anonymous writes ride their own tight buckets so they never
      // contend with profile saves — they must run before the general limiter.
      if (await handleMetricsSubmit(ctx, req, res, pathname, method, key)) return;
      if (await handleKnockDrop(ctx, req, res, pathname, method, key)) return;

      const limiter = method === 'GET' ? readLimiter : writeLimiter;
      if (!limiter.take(key)) {
        res.setHeader('retry-after', '60');
        sendError(res, 429, 'rate_limited');
        return;
      }

      if (handleMetricsRead(ctx, res, pathname, method)) return;
      if (await handleProfiles(ctx, req, res, pathname, method)) return;
      if (await handleBoops(ctx, req, res, pathname, method)) return;
      if (await handleGroups(ctx, req, res, pathname, method)) return;

      sendError(res, 404, 'not_found');
    } catch {
      sendError(res, 500, 'bad_request', { message: 'internal error' });
    }
  };
}
