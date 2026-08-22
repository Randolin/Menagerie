// The at-rest envelope for server-stored blobs: deflate-raw, then
// AES-256-GCM with a fresh 12-byte IV, base64url encoded as iv‖ciphertext.
// Compression before encryption keeps server rows small; GCM authenticates,
// so the server can never tamper undetectably.
import { bytesToB64url, b64urlToBytes } from '../codec/base64url';
import { deflate, inflate } from '../codec/compress';
import { randomBytes } from '../crypto/random';

const subtle = globalThis.crypto.subtle;

export async function encryptBlob(obj: unknown, key: CryptoKey): Promise<string> {
  const packed = await deflate(new TextEncoder().encode(JSON.stringify(obj)));
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, packed as BufferSource),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64url(out);
}

export async function decryptBlob<T>(b64: string, key: CryptoKey): Promise<T> {
  const bytes = b64urlToBytes(b64);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) as BufferSource },
    key,
    bytes.slice(12) as BufferSource,
  );
  const json = new TextDecoder().decode(await inflate(new Uint8Array(plain)));
  return JSON.parse(json) as T;
}
