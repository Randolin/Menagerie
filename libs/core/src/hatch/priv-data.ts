// The private half of a profile record: encrypted under the EDIT key, so
// only the edit phrase opens it. It embeds the view phrase — the recovery
// link that lets an edit-phrase login reconstruct the full session (view
// key, persona, QR) from one credential — and the FULL answer set: match-only
// desires exist in blob_view only as salted hashes, so this is the sole
// place they survive for re-editing.
import type { Acceptable, Answers, Weights } from '../schema/types';

export interface SavedConnection {
  id: string;
  label: string;
  viewPhrase: string;
  notes: string;
  addedAt: number;
  updatedAt: number;
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
