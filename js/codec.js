// Payload codec: profile answers ⇄ compact URL-fragment string.
//
// Format: "m1." + base64url(deflate-raw(UTF-8 JSON)).
// The payload travels in the URL *fragment* (#p=…), which browsers never send
// to any server — the link itself is the database.

import { PROFILE_VERSION, openItems } from './schema.js';

const FORMAT_PREFIX = 'm1.';

export function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function b64urlToBytes(str) {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeThrough(bytes, stream) {
  const blob = new Blob([bytes]);
  const out = blob.stream().pipeThrough(stream);
  const buf = await new Response(out).arrayBuffer();
  return new Uint8Array(buf);
}

export async function deflate(bytes) {
  return pipeThrough(bytes, new CompressionStream('deflate-raw'));
}

export async function inflate(bytes) {
  return pipeThrough(bytes, new DecompressionStream('deflate-raw'));
}

// Build the shareable payload object from a full profile.
// `answers` may include match-only (desires) answers; those are stripped here
// and represented solely by the pre-computed `matchTokens` (see crypto.js).
export function buildSharePayload(answers, matchTokens, salt) {
  const open = {};
  for (const { item } of openItems()) {
    const v = answers[item.id];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    open[item.id] = v;
  }
  const payload = { v: PROFILE_VERSION, a: open };
  if (matchTokens && matchTokens.length) {
    payload.s = salt;
    payload.m = matchTokens;
  }
  return payload;
}

export async function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const packed = await deflate(new TextEncoder().encode(json));
  return FORMAT_PREFIX + bytesToB64url(packed);
}

export async function decodePayload(str) {
  const clean = str.trim();
  if (!clean.startsWith(FORMAT_PREFIX)) {
    throw new Error('Not a Moxy profile code (expected it to start with "m1.").');
  }
  const bytes = b64urlToBytes(clean.slice(FORMAT_PREFIX.length));
  const json = new TextDecoder().decode(await inflate(bytes));
  const payload = JSON.parse(json);
  if (typeof payload.v !== 'number' || payload.v > PROFILE_VERSION) {
    throw new Error(`This profile uses a newer Moxy version (v${payload.v}) than this page understands.`);
  }
  if (!payload.a || typeof payload.a !== 'object') {
    throw new Error('Malformed profile: missing answers.');
  }
  return payload;
}

// Extract a payload string from any pasted text: full URL, fragment, or bare code.
export function extractPayloadString(text) {
  const t = text.trim();
  const m = t.match(/m1\.[A-Za-z0-9_-]+/);
  if (!m) throw new Error('No Moxy profile code found in that text.');
  return m[0];
}

export function shareUrlFor(encoded, baseUrl) {
  const base = baseUrl ?? `${location.origin}${location.pathname}`;
  return `${base}#p=${encoded}`;
}
