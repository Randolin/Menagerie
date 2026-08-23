// Payload version migration. Decode routes through here, so a new payload
// version only needs a new upgrader in MIGRATIONS, never a change at call
// sites.
import { PROFILE_VERSION, type ProfilePayload } from '../schema/types';
import { RETIRED_ITEM_IDS } from '../schema/sections';
import { getItem } from '../schema/schema';

type Migration = (payload: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version being upgraded FROM: MIGRATIONS[1] turns v1 → v2. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: the schema went fully structured. Free-text answers have no
  // home anymore and are dropped; two retired ids carry over losslessly:
  // ab.pronouns strings that exactly match an ab.pn option become that
  // option, and cn.affection's indexes move to cn.give (identical options).
  1: (payload) => {
    const a: Record<string, unknown> = {
      ...(payload['a'] as Record<string, unknown>),
    };
    const pronouns = a['ab.pronouns'];
    if (typeof pronouns === 'string' && a['ab.pn'] === undefined) {
      const options = (getItem('ab.pn')?.item as { options?: readonly string[] })
        ?.options ?? [];
      const idx = options.indexOf(pronouns.trim());
      if (idx >= 0) a['ab.pn'] = [idx];
    }
    const affection = a['cn.affection'];
    if (Array.isArray(affection) && a['cn.give'] === undefined) {
      a['cn.give'] = affection;
    }
    for (const id of RETIRED_ITEM_IDS) delete a[id];
    for (const [id, v] of Object.entries(a)) {
      if (typeof v === 'string') delete a[id]; // any other stray free text
    }
    return { ...payload, v: 2, a };
  },
};

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
      `This profile uses a newer Menagerie version (v${v}) than this page understands.`,
    );
  }
  if (!payload['a'] || typeof payload['a'] !== 'object') {
    throw new Error('Malformed profile: missing answers.');
  }
  for (let from = v; from < PROFILE_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) throw new Error(`No migration path from payload v${from}.`);
    payload = step(payload);
  }
  return payload as unknown as ProfilePayload;
}
