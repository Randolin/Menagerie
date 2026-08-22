// The private half of a profile record: encrypted under the EDIT key, so
// only the edit phrase opens it. Crucially it embeds the view phrase — the
// recovery link that lets an edit-phrase login reconstruct the full session
// (view key, persona, QR) from one credential.
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
  connections: SavedConnection[];
  notes?: string;
}

export function emptyPrivData(viewPhrase: string): PrivData {
  return { v: 1, viewPhrase, connections: [] };
}

export function migratePrivData(raw: unknown): PrivData {
  if (raw === null || typeof raw !== 'object') throw new Error('Malformed private data.');
  const data = raw as { v?: number };
  if (data.v === 1) return raw as PrivData;
  throw new Error(`Unknown private-data version (v${String(data.v)}).`);
}
