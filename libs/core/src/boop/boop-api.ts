// Boop API wire types (v1). Deliberately dependency-free: the server
// imports this file relatively (TS path aliases don't resolve under plain
// Node), so nothing here may import anything at all.
//
// A boop inbox is a dumb drop-box: a locator, a hashed owner token, and a
// pile of sealed blobs anyone holding the locator can add to. The server
// cannot read a knock, cannot tell a first contact from a reply, and cannot
// see who sent one — but it unavoidably learns that an inbox exists, when
// knocks arrive, and how many are pending. Inbox locators are random and
// travel inside encrypted profile payloads, never derived from a phrase:
// a derivable locator could be registered first by any viewer, who would
// then own its delete token (see sealed-box.ts for the encryption side).

export interface CreateBoopInboxRequest {
  locator: string;
  token: string;
}

export interface BoopKnockRecord {
  id: string;
  blob: string;
  created: number;
}

export interface BoopInboxRecord {
  knocks: BoopKnockRecord[];
}

/** The inbox owner's read/delete credential (random, stored in PrivData). */
export const BOOP_TOKEN_HEADER = 'x-menagerie-boop-token';

/**
 * Hard cap per knock blob. Clients pad every sealed knock to one fixed
 * plaintext bucket (SEAL_PAD_BYTES in sealed-box.ts) so ciphertext length
 * can't fingerprint what a knock carries; this cap is that bucket's b64url
 * size plus envelope headroom, NOT the profile blob cap — one inbox must
 * never pin megabytes.
 */
export const BOOP_MAX_KNOCK_BYTES = 4096;

/** Pending knocks per inbox; further posts get 503 at_capacity. */
export const BOOP_MAX_PENDING = 16;

/** Per-inbox arrival throttle: knocks accepted per rolling hour. */
export const BOOP_KNOCKS_PER_HOUR = 4;

/** Unread knocks are swept after this long. */
export const BOOP_KNOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
