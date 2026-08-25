// Boop routes. The anonymous knock drop rides its own tight rate bucket and
// is dispatched BEFORE the general limiter (see http.ts); the owner-facing
// inbox routes go through the general read/write limiter like everything
// else.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HATCH_BLOB_RE, HATCH_LOCATOR_RE } from '../libs/core/src/hatch/hatch-api.ts';
import { BOOP_MAX_KNOCK_BYTES, BOOP_TOKEN_HEADER } from '../libs/core/src/boop/boop-api.ts';
import { send, sendError, type RouteContext } from './http-util.ts';

/**
 * POST /v2/boops/:locator/knocks — anonymous sealed drop. No token: holding
 * the locator (which travels only inside encrypted payloads) is the
 * capability to knock. The server stores an opaque blob; what it unavoidably
 * learns is that this inbox received a knock now — and a 503 here tells any
 * locator holder the inbox is full, an accepted leak. A per-inbox arrival
 * throttle in the DB backs up the caller's per-IP bucket.
 */
export async function handleKnockDrop(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  clientKey: string,
): Promise<boolean> {
  const knockMatch = pathname.match(/^\/v2\/boops\/([^/]+)\/knocks$/);
  if (!knockMatch || method !== 'POST') return false;
  if (!ctx.boopLimiter.take(clientKey)) {
    res.setHeader('retry-after', '60');
    sendError(res, 429, 'rate_limited');
    return true;
  }
  if (!HATCH_LOCATOR_RE.test(knockMatch[1])) {
    sendError(res, 400, 'bad_request', { message: 'malformed locator' });
    return true;
  }
  const body = await ctx.readJson(req, res);
  if (!body) return true;
  const blob = body['blob'];
  // Knocks get their own tight byte cap: clients pad every sealed
  // knock to one fixed bucket, so anything bigger is malformed anyway.
  if (
    typeof blob !== 'string' ||
    !HATCH_BLOB_RE.test(blob) ||
    Buffer.byteLength(blob, 'utf8') > BOOP_MAX_KNOCK_BYTES
  ) {
    sendError(res, 400, 'bad_request', { message: 'blob must be base64url' });
    return true;
  }
  const outcome = ctx.opts.boops.addKnock(knockMatch[1], blob);
  if (outcome === 'added') send(res, 201, { ok: true });
  else if (outcome === 'not_found') sendError(res, 404, 'not_found');
  else if (outcome === 'full') sendError(res, 503, 'at_capacity');
  else {
    res.setHeader('retry-after', '3600');
    sendError(res, 429, 'rate_limited');
  }
  return true;
}

/** The owner-facing inbox routes: register, poll, delete, prune one knock. */
export async function handleBoops(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  // POST /v2/boops — register an inbox. Locator AND token are random,
  // client-minted, and travel in the JSON body: the token is being
  // registered here, not proven. Nothing links an inbox row to a profile
  // row server-side — though a sender registering a reply box and then
  // knocking on another inbox seconds later hands the server a timing
  // correlation (clients jitter the pair to soften it).
  if (pathname === '/v2/boops' && method === 'POST') {
    if (
      ctx.opts.maxBoopInboxes !== undefined &&
      ctx.opts.boops.count() >= ctx.opts.maxBoopInboxes
    ) {
      sendError(res, 503, 'at_capacity');
      return true;
    }
    const body = await ctx.readJson(req, res);
    if (!body) return true;
    const locator = body['locator'];
    const token = body['token'];
    if (
      typeof locator !== 'string' ||
      !HATCH_LOCATOR_RE.test(locator) ||
      typeof token !== 'string' ||
      !HATCH_LOCATOR_RE.test(token)
    ) {
      sendError(res, 400, 'bad_request', { message: 'malformed locator or token' });
      return true;
    }
    const tokenHash = ctx.sha256Hex(token);
    const outcome = ctx.opts.boops.createInbox(locator, tokenHash);
    if (outcome === 'created') send(res, 201, { ok: true });
    else sendError(res, 409, 'locator_taken');
    return true;
  }

  // /v2/boops/:locator/knocks/:id — the owner deletes one knock.
  const knockDeleteMatch = pathname.match(/^\/v2\/boops\/([^/]+)\/knocks\/([^/]+)$/);
  if (knockDeleteMatch && method === 'DELETE') {
    if (!HATCH_LOCATOR_RE.test(knockDeleteMatch[1])) {
      sendError(res, 400, 'bad_request', { message: 'malformed locator' });
      return true;
    }
    const hash = ctx.tokenHashFrom(req, BOOP_TOKEN_HEADER);
    if (!hash) {
      sendError(res, 400, 'bad_request', { message: 'missing or malformed boop token' });
      return true;
    }
    const outcome = ctx.opts.boops.deleteKnock(knockDeleteMatch[1], hash, knockDeleteMatch[2]);
    if (outcome === 'deleted') send(res, 200, { ok: true });
    else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
    else sendError(res, 404, 'not_found');
    return true;
  }

  // /v2/boops/:locator — the owner polls (bumping the idle-GC clock) or
  // tears the inbox down (rotation, profile deletion, answered box).
  const boopMatch = pathname.match(/^\/v2\/boops\/([^/]+)$/);
  if (!boopMatch) return false;
  if (!HATCH_LOCATOR_RE.test(boopMatch[1])) {
    sendError(res, 400, 'bad_request', { message: 'malformed locator' });
    return true;
  }
  const hash = ctx.tokenHashFrom(req, BOOP_TOKEN_HEADER);
  if (!hash) {
    sendError(res, 400, 'bad_request', { message: 'missing or malformed boop token' });
    return true;
  }
  if (method === 'GET') {
    const outcome = ctx.opts.boops.list(boopMatch[1], hash);
    if (outcome.status === 'ok') send(res, 200, { knocks: outcome.knocks });
    else if (outcome.status === 'bad_token') sendError(res, 401, 'bad_token');
    else sendError(res, 404, 'not_found');
    return true;
  }
  if (method === 'DELETE') {
    const outcome = ctx.opts.boops.deleteInbox(boopMatch[1], hash);
    if (outcome === 'deleted') send(res, 200, { ok: true });
    else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
    else sendError(res, 404, 'not_found');
    return true;
  }
  sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
  return true;
}
