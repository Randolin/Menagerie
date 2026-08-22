// Generates compatibility fixtures from the LEGACY (vanilla JS) implementation.
// The TS rewrite must decode these byte-identically — they are the oracle that
// proves old share links keep working. Run once against the old modules; the
// emitted JSON is committed, this script is deleted with legacy/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = async (p) => import(join(root, 'legacy', 'js', p));

const codec = await legacy('codec.js');
const crypto = await legacy('crypto.js');

async function makeProfile(answers) {
  const salt = crypto.randomSalt();
  const tokens = await crypto.buildMatchTokens(answers, salt);
  const payload = codec.buildSharePayload(answers, tokens, salt);
  const code = await codec.encodePayload(payload);
  return { answers, payload, code };
}

const alex = await makeProfile({
  'ab.name': 'Alex', 'ab.pronouns': 'he/him', 'ab.age': 2, 'ab.gender': [1],
  'ab.orient': [3], 'ab.intro': 'Legacy fixture — do not edit by hand.',
  'sk.friend': 3, 'sk.poly': 3, 'sk.swing': 2, 'sk.mono': 0, 'sk.longterm': 2,
  'va.together': 2, 'va.novelty': 5, 'va.spirit': 1, 'va.plan': 4, 'va.social': 3,
  'ls.alcohol': 2, 'ls.kids': 3, 'ls.pets': [0], 'ls.sleep': 1, 'ls.tidy': 1,
  'cn.affection': [1, 2], 'cn.conflict': 1, 'cn.tempo': 2,
  'st.ideal': [2, 3], 'st.meta': 0, 'st.capacity': 2,
  'nt.musthave': 'Honesty and a sense of humor.',
  'dp.rope': 3, 'dp.cuddle': 2, 'dp.party': 1, 'dp.impact': 0,
});

const sam = await makeProfile({
  'ab.name': 'Sam', 'ab.age': 2, 'ab.gender': [0, 3], 'ab.orient': [4],
  'sk.friend': 3, 'sk.poly': 2, 'sk.swing': 0, 'sk.mono': 1, 'sk.longterm': 3,
  'va.together': 5, 'va.novelty': 4, 'va.spirit': 2, 'va.plan': 1, 'va.social': 5,
  'ls.alcohol': 1, 'ls.kids': 4, 'ls.pets': [1, 4], 'ls.sleep': 0, 'ls.tidy': 3,
  'cn.affection': [0, 1], 'cn.conflict': 0, 'cn.tempo': 3,
  'st.ideal': [3], 'st.meta': 1, 'st.capacity': 3,
  'nt.musthave': 'Curiosity. Show up when you say you will.',
  'dp.rope': 1, 'dp.cuddle': 0, 'dp.tantra': 2, 'dp.impact': 3,
});

const profileFixture = {
  comment: 'Generated from the legacy JS implementation. The oracle for m1. decode compatibility.',
  code: alex.code,
  expectedPayload: alex.payload,
  // probeLevel(payload, itemId) must return exactly these values in the rewrite.
  probes: [
    { itemId: 'dp.rope', level: 3 },
    { itemId: 'dp.cuddle', level: 2 },
    { itemId: 'dp.party', level: 1 },
    { itemId: 'dp.impact', level: 0 },   // level-0: never probeable
    { itemId: 'dp.tantra', level: 0 },   // unanswered: never probeable
  ],
};

const compareFixture = {
  comment: 'Two legacy profiles; mutual desires must reveal exactly these items.',
  codes: [alex.code, sam.code],
  names: ['Alex', 'Sam'],
  expectedMutualDesires: [{ itemId: 'dp.rope', levels: [3, 1] }],
  expectedHiddenDesires: ['dp.cuddle', 'dp.impact', 'dp.party', 'dp.tantra'],
};

for (const dir of ['e2e/fixtures', 'libs/core/src/codec/fixtures']) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'legacy-profile.json'), JSON.stringify(profileFixture, null, 2));
  writeFileSync(join(root, dir, 'legacy-compare.json'), JSON.stringify(compareFixture, null, 2));
}

// Sanity: verify the oracle against the legacy implementation itself.
const match = await legacy('match.js');
const decoded = await codec.decodePayload(profileFixture.code);
if (JSON.stringify(decoded) !== JSON.stringify(profileFixture.expectedPayload)) {
  throw new Error('fixture self-check failed: decode mismatch');
}
for (const p of profileFixture.probes) {
  const got = await crypto.probeLevel(decoded, p.itemId);
  if (got !== p.level) throw new Error(`fixture self-check failed: probe ${p.itemId} → ${got}, want ${p.level}`);
}
const rows = await match.revealMutualDesires([
  await codec.decodePayload(compareFixture.codes[0]),
  await codec.decodePayload(compareFixture.codes[1]),
]);
const gotIds = rows.map((r) => r.item.id).sort();
const wantIds = compareFixture.expectedMutualDesires.map((m) => m.itemId).sort();
if (JSON.stringify(gotIds) !== JSON.stringify(wantIds)) {
  throw new Error(`fixture self-check failed: mutual ${gotIds} want ${wantIds}`);
}
console.log('fixtures written and self-checked:',
  profileFixture.code.length, 'and', sam.code.length, 'char codes');
