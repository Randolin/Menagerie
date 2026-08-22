// Payload version migration. Today there is only v1, so the chain is
// identity — but decode routes through here so a future v2 only needs a new
// upgrader in MIGRATIONS, never a change at call sites.
import { PROFILE_VERSION, type ProfilePayload } from '../schema/types';

type Migration = (payload: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version being upgraded FROM: MIGRATIONS[1] turns v1 → v2. */
const MIGRATIONS: Record<number, Migration> = {};

export function migrateToCurrent(raw: unknown): ProfilePayload {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Malformed profile: not an object.');
  }
  let payload = raw as Record<string, unknown>;
  const v = payload['v'];
  if (typeof v !== 'number') {
    throw new Error('Malformed profile: missing version.');
  }
  if (v > PROFILE_VERSION) {
    throw new Error(
      `This profile uses a newer Moxy version (v${v}) than this page understands.`,
    );
  }
  for (let from = v; from < PROFILE_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) throw new Error(`No migration path from payload v${from}.`);
    payload = step(payload);
  }
  if (!payload['a'] || typeof payload['a'] !== 'object') {
    throw new Error('Malformed profile: missing answers.');
  }
  return payload as unknown as ProfilePayload;
}
