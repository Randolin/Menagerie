// The private half of a profile record: encrypted under the EDIT key, so
// only the edit phrase opens it. It embeds the view phrase — the recovery
// link that lets an edit-phrase login reconstruct the full session (view
// key, persona, QR) from one credential — and the FULL answer set: match-only
// desires exist in blob_view only as salted hashes, so this is the sole
// place they survive for re-editing.
import type { Acceptable, Answers, Weights } from '../schema/types';
import type { BoopContent } from '../boop/boop-data';

export interface SavedConnection {
  id: string;
  label: string;
  viewPhrase: string;
  notes: string;
  addedAt: number;
  updatedAt: number;
}

/**
 * A group this profile knows: created (adminPhrase present) and/or joined
 * (deposit credentials present). The member locator/token are random — not
 * derived — so this encrypted record is their only home.
 */
export interface SavedGroupMembership {
  id: string;
  groupPhrase: string;
  adminPhrase?: string;
  memberLocator?: string;
  memberToken?: string;
  pseudonym?: string;
  emoji?: string;
  tier?: 1 | 2;
  addedAt: number;
}

/**
 * This profile's boop credentials. The private key and inbox token exist
 * only here (encrypted under the edit key); the public key and inbox
 * locator are published in blob_view. All four rotate together with the
 * view phrase — rotation is the block lever.
 */
export interface BoopCreds {
  /** Sealed-box private key (JWK JSON, b64url). */
  priv: string;
  /** Random inbox locator (matches the published payload's `k.inbox`). */
  inbox: string;
  /** Random inbox read/delete token. */
  token: string;
}

/**
 * A boop this profile sent, tracked so the one-shot reply box stays
 * readable. Written to PrivData and saved BEFORE the reply box or knock
 * exists server-side — a tab closed mid-send must never orphan a box the
 * other person later replies into.
 */
export interface SentBoop {
  id: string;
  /** Recipient's claimed creature label + emoji, for display. */
  label: string;
  emoji: string;
  replyBox: { locator: string; token: string; key: string };
  sentAt: number;
  status: 'pending' | 'sent' | 'answered';
  /** The one reply, kept here once read — the reply box is deleted after. */
  reply?: BoopContent;
}

export interface PrivData {
  v: 1;
  viewPhrase: string;
  /** Complete working answers, desires included. */
  answers: Answers;
  /**
   * Stable per profile so re-saves don't rotate desire fingerprints;
   * regenerated together with the view phrase, so old links and old token
   * sets die at the same moment. Null until desires are first answered.
   */
  desiresSalt: string | null;
  connections: SavedConnection[];
  notes?: string;
  /** Per-item importance weighting (absent on blobs written before v2 schema). */
  weights?: Weights;
  /** Acceptable option sets for dealbreaker-weighted items. */
  acceptable?: Acceptable;
  /** Groups created or joined (absent on blobs written before groups). */
  groups?: SavedGroupMembership[];
  /** Opt-in to the anonymous epoch counters (absent = off). */
  metricsOptIn?: boolean;
  /** Last epoch this profile submitted counters for (best-effort dedup;
   *  the server's token set is the real gate). */
  metricsLastEpoch?: string;
  /** Boop inbox credentials (absent on blobs written before boops). */
  boop?: BoopCreds;
  /** Boops sent, with their one-shot reply-box credentials. */
  sentBoops?: SentBoop[];
}

export function emptyPrivData(viewPhrase: string): PrivData {
  return { v: 1, viewPhrase, answers: {}, desiresSalt: null, connections: [] };
}

export function migratePrivData(raw: unknown): PrivData {
  if (raw === null || typeof raw !== 'object') throw new Error('Malformed private data.');
  const data = raw as Partial<PrivData> & { v?: number };
  if (data.v !== 1) throw new Error(`Unknown private-data version (v${String(data.v)}).`);
  if (data.answers && data.desiresSalt !== undefined && data.connections) return raw as PrivData;
  // Fill fields absent in blobs written before they existed.
  return {
    ...(raw as PrivData),
    answers: data.answers ?? {},
    desiresSalt: data.desiresSalt ?? null,
    connections: data.connections ?? [],
  };
}
