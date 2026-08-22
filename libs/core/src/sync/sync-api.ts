// Wire contract shared by the sync client and the server (the server imports
// this file relatively — TS path aliases don't resolve under plain Node).
//
// The whole API is four routes over one table: the server maps an opaque
// 22-char locator to an opaque ciphertext blob plus a version counter, and
// requires a write token (stored only as its SHA-256) for mutations. It never
// sees a passphrase, a key, a plaintext byte, or an identity.

export interface VaultRecord {
  blob: string;
  version: number;
}

export interface PutVaultRequest {
  blob: string;
}

export interface PutVaultResponse {
  version: number;
}

export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'bad_token'
  | 'version_conflict'
  | 'too_large'
  | 'rate_limited';

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
  /** On version_conflict: the server's current state rides along. */
  version?: number;
  blob?: string;
}

export const WRITE_TOKEN_HEADER = 'x-moxy-write-token';

/** 16 bytes base64url = exactly 22 chars; locator and write token alike. */
export const LOCATOR_RE = /^[A-Za-z0-9_-]{22}$/;
export const BLOB_RE = /^[A-Za-z0-9_-]+$/;

export const DEFAULT_MAX_BLOB_BYTES = 262_144;
