// Anonymous-metrics routes. The opt-in submission rides its own tight rate
// bucket and is dispatched BEFORE the general limiter (see http.ts).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HATCH_LOCATOR_RE } from '../libs/core/src/hatch/hatch-api.ts';
import {
  METRICS_BUCKET_RE,
  METRICS_DEFAULT_K,
  METRICS_EPOCH_RE,
  METRICS_MAX_BUCKETS,
  currentEpoch,
} from '../libs/core/src/metrics/metrics-api.ts';
import { send, sendError, type RouteContext } from './http-util.ts';

/** POST /v2/metrics — opt-in anonymous counters for the current epoch. */
export async function handleMetricsSubmit(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  clientKey: string,
): Promise<boolean> {
  if (pathname !== '/v2/metrics' || method !== 'POST') return false;
  if (!ctx.metricsLimiter.take(clientKey)) {
    res.setHeader('retry-after', '60');
    sendError(res, 429, 'rate_limited');
    return true;
  }
  const body = await ctx.readJson(req, res);
  if (!body) return true;
  const epoch = body['epoch'];
  const token = body['token'];
  const buckets = body['buckets'];
  if (typeof epoch !== 'string' || epoch !== currentEpoch(Date.now())) {
    sendError(res, 400, 'bad_request', { message: 'epoch must be the current UTC month' });
    return true;
  }
  if (typeof token !== 'string' || !HATCH_LOCATOR_RE.test(token)) {
    sendError(res, 400, 'bad_request', { message: 'malformed token' });
    return true;
  }
  if (
    !Array.isArray(buckets) ||
    buckets.length === 0 ||
    buckets.length > METRICS_MAX_BUCKETS ||
    !buckets.every((b) => typeof b === 'string' && METRICS_BUCKET_RE.test(b))
  ) {
    sendError(res, 400, 'bad_request', { message: 'malformed buckets' });
    return true;
  }
  const tokenHash = ctx.sha256Hex(token);
  const outcome = ctx.opts.metrics.submit(epoch, tokenHash, buckets as string[]);
  if (outcome === 'ok') send(res, 201, { ok: true });
  else sendError(res, 409, 'version_conflict', { message: 'already submitted this epoch' });
  return true;
}

/** GET /v2/metrics/:epoch — the k-floored public aggregate. */
export function handleMetricsRead(
  ctx: RouteContext,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  const metricsMatch = pathname.match(/^\/v2\/metrics\/([^/]+)$/);
  if (!metricsMatch || method !== 'GET') return false;
  if (!METRICS_EPOCH_RE.test(metricsMatch[1])) {
    sendError(res, 400, 'bad_request', { message: 'malformed epoch' });
    return true;
  }
  res.setHeader('cache-control', 'public, max-age=300');
  send(res, 200, {
    epoch: metricsMatch[1],
    buckets: ctx.opts.metrics.get(metricsMatch[1], ctx.opts.metricsK ?? METRICS_DEFAULT_K),
  });
  return true;
}
