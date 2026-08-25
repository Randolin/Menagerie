// Shared HTTP plumbing for the route modules: CORS, response helpers, body
// reading, and the per-request helper context createApp hands each router.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
  type HatchApiError,
  type HatchErrorCode,
} from '../libs/core/src/hatch/hatch-api.ts';
import {
  ADMIN_TOKEN_HEADER,
  MEMBER_TOKEN_HEADER,
  NEW_ADMIN_TOKEN_HEADER,
} from '../libs/core/src/group/group-api.ts';
import { BOOP_TOKEN_HEADER } from '../libs/core/src/boop/boop-api.ts';
import type { ProfilesDb } from './profiles-db.ts';
import type { RateLimiter } from './rate-limit.ts';
import type { GroupsDb } from './groups-db.ts';
import type { MetricsDb } from './metrics-db.ts';
import type { BoopsDb } from './boops-db.ts';

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

/**
 * What createApp hands each route module: the options plus the helpers that
 * close over per-app state (blob cap, body cap). A handler answers the
 * request and returns true, or returns false when the request isn't its —
 * the dispatcher in http.ts owns ordering and the final 404.
 */
export interface RouteContext {
  opts: AppOptions;
  /** Tight per-IP buckets for the two anonymous write routes (see http.ts). */
  metricsLimiter: RateLimiter;
  boopLimiter: RateLimiter;
  validBlob(blob: unknown): blob is string;
  sha256Hex(token: string): string;
  /** Header token → SHA-256 hex, or null if missing/malformed. */
  tokenHashFrom(req: IncomingMessage, header: string): string | null;
  /** Positive-integer If-Match header, or null after answering 400 itself. */
  parseIfMatch(req: IncomingMessage, res: ServerResponse): number | null;
  /** Capped JSON body, or null after answering 413/400 itself. */
  readJson(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | null>;
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

export function send(res: ServerResponse, status: number, body?: unknown): void {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    ...(payload ? { 'content-type': 'application/json' } : {}),
  });
  res.end(payload);
}

export function sendError(
  res: ServerResponse,
  status: number,
  error: HatchErrorCode,
  extra?: Partial<HatchApiError>,
): void {
  send(res, status, { error, ...extra } satisfies HatchApiError);
}

export function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export async function readBody(req: IncomingMessage, cap: number): Promise<string | null> {
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
