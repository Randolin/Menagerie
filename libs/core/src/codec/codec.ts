// Payload codec: profile answers ⇄ compact URL-fragment string.
//
// Format "m1.": base64url(deflate-raw(UTF-8 JSON)). The payload travels in
// the URL *fragment* (#p=…), which browsers never send to any server — the
// link itself is the database. The prefix registry exists so a future "m2."
// can coexist without breaking a single old link.
import type { Answers, ProfilePayload } from '../schema/types';
import { PROFILE_VERSION } from '../schema/types';
import { openItems } from '../schema/schema';
import { bytesToB64url, b64urlToBytes } from './base64url';
import { deflate, inflate } from './compress';
import { migrateToCurrent } from './migrate';

const CURRENT_PREFIX = 'm1.';
const KNOWN_PREFIXES = ['m1.'] as const;

const PAYLOAD_PATTERN = new RegExp(
  `(?:${KNOWN_PREFIXES.map((p) => p.replace('.', '\\.')).join('|')})[A-Za-z0-9_-]+`,
);

/**
 * Build the shareable payload object from a full answer set. Match-only
 * (desires) answers are stripped here and represented solely by the
 * pre-computed `matchTokens` (see crypto/match-tokens.ts).
 */
export function buildSharePayload(
  answers: Answers,
  matchTokens: readonly string[],
  salt: string | null,
): ProfilePayload {
  const open: Record<string, Answers[string]> = {};
  for (const { item } of openItems()) {
    const v = answers[item.id];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    open[item.id] = v;
  }
  const payload: ProfilePayload = { v: PROFILE_VERSION, a: open };
  if (matchTokens.length && salt) {
    payload.s = salt;
    payload.m = [...matchTokens];
  }
  return payload;
}

export async function encodePayload(payload: ProfilePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const packed = await deflate(new TextEncoder().encode(json));
  return CURRENT_PREFIX + bytesToB64url(packed);
}

export async function decodePayload(str: string): Promise<ProfilePayload> {
  const clean = str.trim();
  const prefix = KNOWN_PREFIXES.find((p) => clean.startsWith(p));
  if (!prefix) {
    throw new Error('Not a Moxy profile code (expected it to start with "m1.").');
  }
  const bytes = b64urlToBytes(clean.slice(prefix.length));
  const json = new TextDecoder().decode(await inflate(bytes));
  return migrateToCurrent(JSON.parse(json));
}

/** Extract a payload string from any pasted text: full URL, fragment, or bare code. */
export function extractPayloadString(text: string): string {
  const m = text.trim().match(PAYLOAD_PATTERN);
  if (!m) throw new Error('No Moxy profile code found in that text.');
  return m[0];
}

/**
 * Build a share URL in the LEGACY-compatible format (#p=<code>): links minted
 * here must open on any Moxy deployment, old or new. Part of the contract.
 */
export function shareUrlFor(encoded: string, baseUrl?: string): string {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#p=${encoded}`;
}

export function compareUrlFor(codes: readonly string[], baseUrl?: string): string {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#c=${codes.join('~')}`;
}
