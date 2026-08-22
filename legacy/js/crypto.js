// Crypto for Moxy: match tokens for the desires section, and the
// passphrase-locked vault.
//
// Honest threat model (also documented in the About page):
//
// * Match tokens are salted hashes of (item, interest level). The compare UI
//   only reveals an item when BOTH profiles carry a positive token for it.
//   Because the answer space is small, a motivated person with your link
//   could dictionary-test the hashes — so treat "match-only" as a polite
//   curtain, not cryptographic secrecy. "Not for me" answers are never
//   encoded in any form, so they are genuinely unknowable. The per-profile
//   random salt prevents two different shares from being linked to the same
//   person by comparing token sets.
//
// * The vault is real cryptography: AES-256-GCM with a key derived from your
//   passphrase via PBKDF2. No server, no recovery. Losing the passphrase
//   loses the vault.

import { bytesToB64url } from './codec.js';
import { matchItems } from './schema.js';

const subtle = globalThis.crypto.subtle;

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function randomSalt() {
  return bytesToB64url(randomBytes(9)); // 12 chars
}

async function sha256(text) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

const TOKEN_CHARS = 16; // 96 bits of the hash, base64url

export async function matchToken(salt, itemId, level) {
  const h = await sha256(`moxy.mt.v1|${salt}|${itemId}|${level}`);
  return bytesToB64url(h).slice(0, TOKEN_CHARS);
}

// Build the token set for a profile's match-only answers.
// Only positive levels (>= 1) produce tokens; the set is padded with random
// decoys to the next multiple of 8 and shuffled, so the token count doesn't
// reveal how many desires were marked.
export async function buildMatchTokens(answers, salt) {
  const tokens = [];
  for (const { item } of matchItems()) {
    const level = answers[item.id];
    if (typeof level === 'number' && level >= 1 && level <= 3) {
      tokens.push(await matchToken(salt, item.id, level));
    }
  }
  if (tokens.length === 0) return [];
  const padTo = Math.ceil((tokens.length + 1) / 8) * 8;
  while (tokens.length < padTo) {
    tokens.push(bytesToB64url(randomBytes(12)).slice(0, TOKEN_CHARS));
  }
  // Fisher–Yates with crypto randomness.
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = randomBytes(4).reduce((a, b) => (a << 8) | b, 0) >>> 0;
    const k = j % (i + 1);
    [tokens[i], tokens[k]] = [tokens[k], tokens[i]];
  }
  return tokens;
}

// Given another profile's payload (salt + token set), find which of THEIR
// desires levels are discoverable for a specific item. Returns 0 if none.
export async function probeLevel(payload, itemId) {
  if (!payload.m || !payload.s) return 0;
  const set = new Set(payload.m);
  for (let level = 3; level >= 1; level--) {
    if (set.has(await matchToken(payload.s, itemId, level))) return level;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Vault: passphrase → { locator, AES-GCM key }.
//
// The locator names the localStorage slot; the key encrypts its contents.
// Both come from one PBKDF2-SHA-512 derivation so neither is cheaper to
// brute-force than the other. The salt is a fixed app constant because the
// vault must be findable from the passphrase alone — the passphrase's own
// entropy (5 diceware words ≈ 65 bits) is what carries the security.
// ---------------------------------------------------------------------------

const VAULT_KDF_SALT = 'moxy.vault.v1';
export const VAULT_KDF_ITERATIONS = 300_000;

export function normalizePassphrase(pass) {
  return pass.trim().toLowerCase().split(/[\s-]+/).join(' ');
}

export async function deriveVaultKeys(passphrase) {
  const material = await subtle.importKey(
    'raw', new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt: new TextEncoder().encode(VAULT_KDF_SALT),
      iterations: VAULT_KDF_ITERATIONS,
    },
    material, 512);
  const bytes = new Uint8Array(bits);
  const locator = bytesToB64url(bytes.slice(0, 16));
  const key = await subtle.importKey(
    'raw', bytes.slice(16, 48), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { locator, key };
}

export async function encryptVault(obj, key) {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64url(out);
}

export async function decryptVault(b64, key) {
  const { b64urlToBytes } = await import('./codec.js');
  const bytes = b64urlToBytes(b64);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

// Generate a diceware passphrase; the wordlist is imported lazily so the
// 78 KB list only loads on the vault screens.
export async function generatePassphrase(words = 5) {
  const { WORDS } = await import('./wordlist.js');
  const out = [];
  for (let i = 0; i < words; i++) {
    // Rejection sampling for a uniform pick from 7776.
    let idx;
    do {
      const r = randomBytes(2);
      idx = (r[0] << 8) | r[1];
    } while (idx >= 65536 - (65536 % WORDS.length));
    out.push(WORDS[idx % WORDS.length]);
  }
  return out.join(' ');
}
