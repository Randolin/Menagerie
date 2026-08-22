// Wire contract for the hatch profile API, shared by client and server (the
// server imports this file relatively — TS path aliases don't resolve under
// plain Node). Self-contained on purpose: the older sync-api dies with the
// v1 vault routes.
//
// The server's entire data model: an opaque view_locator and edit_locator
// naming one row of two ciphertext blobs plus a version counter, mutations
// gated by a bearer token stored only as its SHA-256. Zero knowledge.

export interface CreateProfileRequest {
  view_locator: string;
  edit_locator: string;
  blob_view: string;
  blob_priv: string;
}

export interface ViewRecord {
  blob_view: string;
  version: number;
}

export interface EditRecord {
  blob_view: string;
  blob_priv: string;
  version: number;
  populated: boolean;
}

export interface PutProfileRequest {
  blob_view: string;
  blob_priv: string;
  /** Monotonic on the server: once true, stays true. */
  populated: boolean;
  /** Atomic re-key: move the record to a new view identity. */
  new_view_locator?: string;
  /** Atomic re-key: move the record to a new edit identity (with new token header). */
  new_edit_locator?: string;
}

export interface PutProfileResponse {
  version: number;
}

export type HatchErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'bad_token'
  | 'version_conflict'
  | 'locator_taken'
  | 'too_large'
  | 'rate_limited'
  | 'at_capacity';

export interface HatchApiError {
  error: HatchErrorCode;
  message?: string;
  /** On version_conflict: the server's current state rides along. */
  version?: number;
  blob_view?: string;
  blob_priv?: string;
}

export const EDIT_TOKEN_HEADER = 'x-moxy-edit-token';
export const NEW_EDIT_TOKEN_HEADER = 'x-moxy-new-edit-token';

/** 16 bytes base64url = exactly 22 chars; locators and tokens alike. */
export const HATCH_LOCATOR_RE = /^[A-Za-z0-9_-]{22}$/;
export const HATCH_BLOB_RE = /^[A-Za-z0-9_-]+$/;

export const HATCH_DEFAULT_MAX_BLOB_BYTES = 262_144;
