// Unit tests for Moxy core modules. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim so vault.js works under Node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { SECTIONS, allItems, openItems, matchItems } = await import('../js/schema.js');
const codec = await import('../js/codec.js');
const cryptoMod = await import('../js/crypto.js');
const match = await import('../js/match.js');
const vault = await import('../js/vault.js');

function sampleAnswers() {
  return {
    'ab.name': 'River',
    'ab.pronouns': 'they/them',
    'ab.age': 1,
    'ab.gender': [2],
    'ab.orient': [4, 8],
    'sk.friend': 3,
    'sk.poly': 2,
    'sk.swing': 1,
    'sk.mono': 0,
    'va.together': 4,
    'va.novelty': 5,
    'ls.alcohol': 2,
    'ls.pets': [0, 4],
    'cn.affection': [1, 2],
    'st.ideal': [3, 4],
    'nt.musthave': 'kindness',
    'dp.rope': 3,      // match-only
    'dp.cuddle': 2,    // match-only
    'dp.impact': 0,    // match-only, negative — must never appear anywhere
  };
}

test('schema is internally consistent', () => {
  const ids = new Set();
  for (const { item } of allItems()) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    if (item.type === 'choice' || item.type === 'multi') {
      assert.ok(Array.isArray(item.options) && item.options.length >= 2, item.id);
    }
    if (item.type === 'scale') {
      assert.ok(item.left && item.right, item.id);
    }
  }
  assert.ok(openItems().length > 30);
  assert.ok(matchItems().length >= 20);
  assert.ok(SECTIONS.find((s) => s.id === 'desires').privacy === 'match');
});

test('codec round-trips a payload and strips match-only answers', async () => {
  const answers = sampleAnswers();
  const salt = cryptoMod.randomSalt();
  const tokens = await cryptoMod.buildMatchTokens(answers, salt);
  const payload = codec.buildSharePayload(answers, tokens, salt);

  assert.equal(payload.a['dp.rope'], undefined, 'desires must not leak into open answers');
  assert.equal(payload.a['ab.name'], 'River');

  const encoded = await codec.encodePayload(payload);
  assert.match(encoded, /^m1\.[A-Za-z0-9_-]+$/);
  const decoded = await codec.decodePayload(encoded);
  assert.deepEqual(decoded, payload);

  // Extraction from a full URL and from surrounding prose.
  const url = codec.shareUrlFor(encoded, 'https://example.org/moxy/');
  assert.equal(codec.extractPayloadString(`check me out: ${url} !!`), encoded);
});

test('payload stays small enough for a QR code', async () => {
  // Fully answered profile — worst case.
  const answers = {};
  for (const { item } of allItems()) {
    if (item.type === 'text') answers[item.id] = 'Some reasonably wordy free text answer, twice over. Some reasonably wordy free text answer.';
    else if (item.type === 'multi') answers[item.id] = [0, 1, 2];
    else if (item.type === 'scale') answers[item.id] = 3;
    else if (item.type === 'interest') answers[item.id] = 2;
    else answers[item.id] = 1;
  }
  const salt = cryptoMod.randomSalt();
  const tokens = await cryptoMod.buildMatchTokens(answers, salt);
  const payload = codec.buildSharePayload(answers, tokens, salt);
  const encoded = await codec.encodePayload(payload);
  // QR version 40 (error level L) fits 2953 bytes; leave headroom for the URL.
  assert.ok(encoded.length < 2400, `payload too big: ${encoded.length}`);
});

test('match tokens: mutual desires reveal, one-sided ones stay hidden', async () => {
  const a = sampleAnswers();               // rope:3, cuddle:2, impact:0
  const b = { ...sampleAnswers(), 'dp.rope': 1, 'dp.cuddle': 0, 'dp.impact': 3 };

  const saltA = cryptoMod.randomSalt();
  const saltB = cryptoMod.randomSalt();
  const pa = codec.buildSharePayload(a, await cryptoMod.buildMatchTokens(a, saltA), saltA);
  const pb = codec.buildSharePayload(b, await cryptoMod.buildMatchTokens(b, saltB), saltB);

  const rows = await match.revealMutualDesires([pa, pb]);
  const ids = rows.map((r) => r.item.id);
  assert.ok(ids.includes('dp.rope'), 'both positive → revealed');
  assert.ok(!ids.includes('dp.cuddle'), 'one-sided → hidden');
  assert.ok(!ids.includes('dp.impact'), 'one-sided → hidden');

  const rope = rows.find((r) => r.item.id === 'dp.rope');
  assert.deepEqual(rope.levels, [3, 1]);

  // Token sets are padded and never a multiple-of-8 boundary leak.
  assert.equal(pa.m.length % 8, 0);
  // Level-0 answers must not be probeable.
  assert.equal(await cryptoMod.probeLevel(pa, 'dp.impact'), 0);
});

test('two shares of the same answers are unlinkable via tokens', async () => {
  const answers = sampleAnswers();
  const s1 = cryptoMod.randomSalt();
  const s2 = cryptoMod.randomSalt();
  const t1 = await cryptoMod.buildMatchTokens(answers, s1);
  const t2 = await cryptoMod.buildMatchTokens(answers, s2);
  const overlap = t1.filter((t) => t2.includes(t));
  assert.equal(overlap.length, 0);
});

test('similarity scoring behaves sensibly', () => {
  const scale = { type: 'scale' };
  assert.equal(match.itemSimilarity(scale, 3, 3), 1);
  assert.equal(match.itemSimilarity(scale, 0, 6), 0);
  assert.equal(match.itemSimilarity(scale, 2, undefined), null);

  const ord = { type: 'choice', ordinal: true, options: ['a', 'b', 'c', 'd'] };
  assert.equal(match.itemSimilarity(ord, 1, 2), 1 - 1 / 3);
  const nom = { type: 'choice', options: ['a', 'b', 'c'] };
  assert.equal(match.itemSimilarity(nom, 0, 2), 0);

  const multi = { type: 'multi', options: ['a', 'b', 'c', 'd'] };
  assert.equal(match.itemSimilarity(multi, [0, 1], [1, 2]), 1 / 3);

  const interest = { type: 'interest' };
  assert.ok(Math.abs(match.itemSimilarity(interest, 3, 2) - 2 / 3) < 1e-9);
  assert.equal(match.itemSimilarity(interest, 3, 0), 0);
  assert.equal(match.itemSimilarity(interest, 0, 0), 1, 'shared "not for me" is agreement');
});

test('pair scores and grid', () => {
  const a = sampleAnswers();
  const b = sampleAnswers();
  const pa = codec.buildSharePayload(a, [], null);
  const pb = codec.buildSharePayload(b, [], null);
  const scores = match.pairScores(pa, pb);
  assert.ok(scores.overall > 0.99, 'identical answers → ~1.0');
  const grid = match.buildGrid([pa, pb]);
  assert.ok(grid.length >= 5);
  const seeking = grid.find((g) => g.section.id === 'seeking');
  const friend = seeking.rows.find((r) => r.item.id === 'sk.friend');
  assert.deepEqual(friend.answers, [3, 3]);
  assert.equal(friend.sim, 1);
});

test('vault: create, reopen, wrong passphrase, save/load profile', async () => {
  const pass = 'correct horse battery staple luck';
  let s = await vault.openVault(pass, { createIfMissing: true });
  assert.ok(s);
  const id = await vault.saveProfile('Me', sampleAnswers());
  await vault.saveConnection('Alex', 'm1.abc', 'met at book club');

  vault.lockVault();
  assert.equal(vault.currentSession(), null);

  // Wrong passphrase → no vault found (different locator), not an error.
  assert.equal(await vault.openVault('wrong words entirely here now'), null);

  s = await vault.openVault('  Correct   HORSE battery staple luck '); // normalization
  assert.ok(s, 'normalized passphrase reopens vault');
  assert.equal(s.data.profiles.length, 1);
  assert.equal(s.data.profiles[0].id, id);
  assert.equal(s.data.connections[0].label, 'Alex');

  // Ciphertext at rest: raw storage must not contain answers.
  const raw = [...store.entries()].map(([k, v]) => k + v).join('');
  assert.ok(!raw.includes('River'), 'vault plaintext leaked to storage');

  // Export → wipe → import round-trip.
  const blob = vault.exportVaultBlob();
  store.clear();
  await assert.rejects(vault.importVaultBlob(blob, 'wrong words'), /does not match/);
  const restored = await vault.importVaultBlob(blob, pass);
  assert.equal(restored.data.profiles[0].label, 'Me');
});

test('passphrase generation', async () => {
  const p = await cryptoMod.generatePassphrase(5);
  assert.equal(p.split(' ').length, 5);
  const p2 = await cryptoMod.generatePassphrase(5);
  assert.notEqual(p, p2);
});
