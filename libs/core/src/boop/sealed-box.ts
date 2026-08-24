// Sealed boxes for boops: encrypt a small object so that ONLY the holder of
// the matching private key can open it — not the server, not other viewers
// who know the same inbox locator, not a database thief.
//
// Construction (ECIES): ephemeral-static ECDH on P-256 (the one curve
// WebCrypto guarantees everywhere, Safari included) → HKDF-SHA-256 with
// both public keys bound into the info string (a ciphertext copied toward a
// different recipient key derives a different AES key and fails to open) →
// AES-256-GCM. Plaintext is padded to one fixed bucket first, so every
// sealed knock is byte-identical in length whatever it carries.
//
// A sealed box authenticates NOTHING about the sender: the "from" label,
// attachments, and reply box inside are claims by whoever held the public
// key. Display copy must say "says it's from", never "is from".
import { bytesToB64url, b64urlToBytes } from '../codec/base64url';
import { randomBytes } from '../crypto/random';

const subtle = globalThis.crypto.subtle;

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;
const SEAL_INFO = 'moxy.boop.seal.v1';

/** Fixed plaintext bucket; JSON longer than bucket−2 cannot be sealed. */
export const SEAL_PAD_BYTES = 2048;

/** b64url of a 65-byte uncompressed P-256 point (0x04‖X‖Y). */
const PUB_RAW_BYTES = 65;
const IV_BYTES = 12;

export interface BoopKeyPair {
  /** Raw uncompressed public point, b64url — published in the view payload. */
  pub: string;
  /** Private JWK as JSON, b64url — lives only in encrypted PrivData. */
  priv: string;
}

export async function generateBoopKeyPair(): Promise<BoopKeyPair> {
  const pair = await subtle.generateKey(P256, true, ['deriveBits']);
  const pubRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const privJwk = await subtle.exportKey('jwk', pair.privateKey);
  return {
    pub: bytesToB64url(pubRaw),
    priv: bytesToB64url(new TextEncoder().encode(JSON.stringify(privJwk))),
  };
}

/** Length-prefix + zero-pad to the fixed bucket. */
function padPlaintext(obj: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (json.length > SEAL_PAD_BYTES - 2) throw new Error('Sealed content too large.');
  const out = new Uint8Array(SEAL_PAD_BYTES);
  out[0] = json.length >> 8;
  out[1] = json.length & 0xff;
  out.set(json, 2);
  return out;
}

function unpadPlaintext(bytes: Uint8Array): unknown {
  const len = (bytes[0] << 8) | bytes[1];
  if (bytes.length !== SEAL_PAD_BYTES || len > SEAL_PAD_BYTES - 2) {
    throw new Error('Malformed sealed content.');
  }
  return JSON.parse(new TextDecoder().decode(bytes.slice(2, 2 + len))) as unknown;
}

async function deriveSealKey(
  ownPriv: CryptoKey,
  otherPub: CryptoKey,
  ephPubRaw: Uint8Array,
  recipientPubRaw: Uint8Array,
): Promise<CryptoKey> {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: otherPub }, ownPriv, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const prefix = new TextEncoder().encode(SEAL_INFO);
  const info = new Uint8Array(prefix.length + ephPubRaw.length + recipientPubRaw.length);
  info.set(prefix, 0);
  info.set(ephPubRaw, prefix.length);
  info.set(recipientPubRaw, prefix.length + ephPubRaw.length);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as BufferSource },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Deterministic core, exported only so the spec can freeze exact-byte
 * vectors; use sealTo, which supplies fresh randomness.
 */
export async function sealWithEphemeral(
  ephPriv: CryptoKey,
  ephPubRaw: Uint8Array,
  iv: Uint8Array,
  recipientPub: string,
  obj: unknown,
): Promise<string> {
  const recipientPubRaw = b64urlToBytes(recipientPub);
  const pub = await subtle.importKey('raw', recipientPubRaw as BufferSource, P256, true, []);
  const key = await deriveSealKey(ephPriv, pub, ephPubRaw, recipientPubRaw);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      padPlaintext(obj) as BufferSource,
    ),
  );
  const out = new Uint8Array(ephPubRaw.length + iv.length + ct.length);
  out.set(ephPubRaw, 0);
  out.set(iv, ephPubRaw.length);
  out.set(ct, ephPubRaw.length + iv.length);
  return bytesToB64url(out);
}

export async function sealTo(recipientPub: string, obj: unknown): Promise<string> {
  const eph = await subtle.generateKey(P256, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  return sealWithEphemeral(eph.privateKey, ephPubRaw, randomBytes(IV_BYTES), recipientPub, obj);
}

export async function openSealed<T>(priv: string, sealed: string): Promise<T> {
  const jwk = JSON.parse(new TextDecoder().decode(b64urlToBytes(priv))) as JsonWebKey;
  const privKey = await subtle.importKey('jwk', jwk, P256, false, ['deriveBits']);
  // The recipient's own raw public point, rebuilt from the JWK coordinates —
  // needed to reproduce the HKDF info binding.
  const x = b64urlToBytes(jwk.x ?? '');
  const y = b64urlToBytes(jwk.y ?? '');
  const recipientPubRaw = new Uint8Array(1 + x.length + y.length);
  recipientPubRaw[0] = 0x04;
  recipientPubRaw.set(x, 1);
  recipientPubRaw.set(y, 1 + x.length);

  const bytes = b64urlToBytes(sealed);
  if (bytes.length <= PUB_RAW_BYTES + IV_BYTES) throw new Error('Malformed sealed box.');
  const ephPubRaw = bytes.slice(0, PUB_RAW_BYTES);
  const iv = bytes.slice(PUB_RAW_BYTES, PUB_RAW_BYTES + IV_BYTES);
  const ct = bytes.slice(PUB_RAW_BYTES + IV_BYTES);
  const ephPub = await subtle.importKey('raw', ephPubRaw as BufferSource, P256, true, []);
  const key = await deriveSealKey(privKey, ephPub, ephPubRaw, recipientPubRaw);
  const plain = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource),
  );
  return unpadPlaintext(plain) as T;
}

/** Mint the symmetric key a reply box rides on (32 raw AES-GCM bytes, b64url). */
export function mintBoopBoxKey(): string {
  return bytesToB64url(randomBytes(32));
}

export async function importBoopBoxKey(keyB64: string): Promise<CryptoKey> {
  return subtle.importKey('raw', b64urlToBytes(keyB64) as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
