// Seed the QA cast onto a running profile server.
//
//   npm run seed:qa -- --base-url=http://localhost:8787
//   npm run seed:qa -- --base-url=https://… --yes        # anything non-local
//
// Idempotent by construction: a profile whose view locator already answers is
// left alone, a group is only topped up to its manifest roster size, and a
// knock is only sent to an inbox this run created (boops are rate-limited per
// inbox — see BOOP_KNOCKS_PER_HOUR — so re-running must not spam one).
//
// SECRETS. Edit phrases, admin phrases and box tokens are minted here and
// exist nowhere else: the server stores only their hashes, and the manifest
// deliberately carries read capabilities only. They are printed once and
// written to --out (gitignored). Lose them and the cast is read-only —
// re-mint the manifest phrases and seed again.
//
// Every Argon2id derivation costs seconds by design, so a full seed of six
// profiles takes a couple of minutes. Progress is printed as it goes.
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import {
  HatchClient,
  HatchError,
  PROFILE_VERSION,
  boopPublicKey,
  buildBoop,
  buildDeposit,
  buildMatchTokens,
  buildSharePayload,
  canonicalViewPhrase,
  deriveEditKeys,
  deriveGroupAdminToken,
  deriveGroupReadKeys,
  deriveViewKeys,
  decryptBlob,
  emptyGroupMeta,
  emptyPrivData,
  encryptBlob,
  generateBoopKeyPair,
  groupUrlFor,
  mintBoopBoxKey,
  mintEditPhrase,
  mintPseudonym,
  personaFromViewPhrase,
  randomLocator,
  randomSalt,
  randomToken,
  sealTo,
  viewUrlFor,
  type EditKeys,
  type PrivData,
  type ProfilePayload,
  type SavedGroupMembership,
  type SentBoop,
  type ViewKeys,
} from '@moxy/core';
import {
  QA_BOOPS,
  QA_GROUPS,
  QA_PROFILES,
  assertQaManifest,
  type QaGroupSpec,
  type QaProfileSpec,
} from '../libs/core/src/qa/qa-profiles';
import { qaAnswerSet } from '../libs/core/src/qa/qa-answers';

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    only: { type: 'string' },
    out: { type: 'string', default: 'qa-seed.local.json' },
    yes: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const baseUrl = values['base-url'];
if (!baseUrl)
  fail('--base-url=<url> is required (there is no default: this writes to a real server).');
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl);
if (!local && !values.yes && !values['dry-run']) {
  fail(`${baseUrl} is not localhost. Re-run with --yes if you really mean to seed it.`);
}

const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
const wanted = (id: string): boolean => !only || only.has(id);
const selected = QA_PROFILES.filter((spec) => wanted(spec.id));

assertQaManifest();

if (values['dry-run']) {
  console.log(`Would seed against ${baseUrl}:`);
  for (const spec of selected) {
    const { answers } = qaAnswerSet(spec.mode, spec.seed);
    console.log(
      `  ${spec.id.padEnd(8)} ${spec.mode.padEnd(10)} ${Object.keys(answers).length} answers  ${spec.viewPhrase}`,
    );
  }
  for (const group of QA_GROUPS.filter((g) => wanted(g.id))) {
    console.log(`  group ${group.id}: ${group.members.length} member(s) + ${group.fill} filler`);
  }
  for (const boop of QA_BOOPS) console.log(`  boop ${boop.from} → ${boop.to}`);
  process.exit(0);
}

const client = throttled(new HatchClient(baseUrl));
if (!(await client.health())) fail(`No profile server answering at ${baseUrl}.`);

/** A cast member this run created, and therefore holds the credentials for. */
interface Hatched {
  spec: QaProfileSpec;
  editPhrase: string;
  editKeys: EditKeys;
  viewKeys: ViewKeys;
  priv: PrivData;
  version: number;
}

const hatched = new Map<string, Hatched>();
const existing = new Map<string, ViewKeys>();
const report: Record<string, unknown> = { baseUrl, seededAt: new Date().toISOString() };

// ── Profiles ───────────────────────────────────────────────────────────────
for (const spec of selected) {
  const viewKeys = await deriveViewKeys(spec.viewPhrase);
  if (await client.getView(viewKeys.viewLocator)) {
    existing.set(spec.id, viewKeys);
    console.log(`· ${spec.id}: already present, left alone`);
    continue;
  }
  const editPhrase = await mintEditPhrase();
  const editKeys = await deriveEditKeys(editPhrase);
  const priv = emptyPrivData(spec.viewPhrase);
  const empty: ProfilePayload = { v: PROFILE_VERSION, a: {} };
  await client.create(
    {
      view_locator: viewKeys.viewLocator,
      edit_locator: editKeys.editLocator,
      blob_view: await encryptBlob(empty, viewKeys.viewKey),
      blob_priv: await encryptBlob(priv, editKeys.editKey),
    },
    editKeys.editToken,
  );

  // Answers and a boop identity in one PUT — the inbox has to be published in
  // blob_view before anyone can knock on it below.
  const { answers, weights, acceptable } = qaAnswerSet(spec.mode, spec.seed);
  const boopPair = await generateBoopKeyPair();
  priv.answers = answers;
  priv.weights = weights;
  priv.acceptable = acceptable;
  priv.boop = { priv: boopPair.priv, inbox: randomLocator(), token: randomToken() };
  const entry: Hatched = { spec, editPhrase, editKeys, viewKeys, priv, version: 1 };
  await client.createBoopInbox(priv.boop.inbox, priv.boop.token);
  entry.version = await save(entry);
  hatched.set(spec.id, entry);
  console.log(`✚ ${spec.id}: hatched, ${Object.keys(answers).length} answers`);
}

// ── Groups ─────────────────────────────────────────────────────────────────
const groupSecrets: Record<string, unknown> = {};
for (const group of QA_GROUPS.filter((g) => wanted(g.id))) {
  const { groupLocator, groupKey } = await deriveGroupReadKeys(group.groupPhrase);
  let roster = await client.getGroup(groupLocator);
  let adminPhrase: string | null = null;
  if (!roster) {
    adminPhrase = await mintEditPhrase();
    const adminToken = await deriveGroupAdminToken(adminPhrase);
    await client.createGroup(
      {
        group_locator: groupLocator,
        blob_meta: await encryptBlob(emptyGroupMeta(Date.now()), groupKey),
      },
      adminToken,
    );
    roster = await client.getGroup(groupLocator);
    console.log(`✚ group ${group.id}: created`);
  } else {
    console.log(`· group ${group.id}: already present`);
  }

  const target = group.members.length + group.fill;
  let count = roster?.members.length ?? 0;
  if (count >= target) {
    console.log(`  roster already at ${count}/${target}`);
  } else {
    for (const member of group.members) {
      if (count >= target) break;
      const spec = QA_PROFILES.find((p) => p.id === member.profile);
      if (!spec || !wanted(spec.id)) continue;
      const { answers, weights, acceptable } = qaAnswerSet(spec.mode, spec.seed);
      const pseudonym = mintPseudonym();
      const deposit = buildDeposit(
        member.tier,
        answers,
        weights,
        acceptable,
        member.tier === 2 ? spec.viewPhrase : undefined,
        pseudonym,
        Date.now(),
      );
      const memberLocator = randomLocator();
      const memberToken = randomToken();
      await client.joinGroup(groupLocator, memberToken, {
        member_locator: memberLocator,
        blob_member: await encryptBlob(deposit, groupKey),
      });
      count++;
      // Only a profile we hatched has a PrivData we can write the membership
      // into; an already-present one still deposits, it just won't list the
      // group when you log in as it.
      const owner = hatched.get(spec.id);
      if (owner) {
        const membership: SavedGroupMembership = {
          id: crypto.randomUUID(),
          groupPhrase: group.groupPhrase,
          adminPhrase: adminPhrase ?? undefined,
          memberLocator,
          memberToken,
          pseudonym: pseudonym.pseudonym,
          emoji: pseudonym.emoji,
          tier: member.tier,
          addedAt: Date.now(),
        };
        owner.priv.groups = [...(owner.priv.groups ?? []), membership];
      }
    }
    // Filler deposits: ciphertext under the group key, no profile behind them.
    for (let i = count; i < target; i++) {
      const { answers, weights, acceptable } = qaAnswerSet('core-only', 100 + i);
      const deposit = buildDeposit(
        1,
        answers,
        weights,
        acceptable,
        undefined,
        mintPseudonym(),
        Date.now(),
      );
      await client.joinGroup(groupLocator, randomToken(), {
        member_locator: randomLocator(),
        blob_member: await encryptBlob(deposit, groupKey),
      });
    }
    console.log(`  roster ${count} real + ${target - count} filler = ${target}`);
  }
  if (adminPhrase)
    groupSecrets[group.id] = {
      groupPhrase: group.groupPhrase,
      adminPhrase,
      url: groupUrlFor(group.groupPhrase, appUrl()),
    };
}

// ── Boops ──────────────────────────────────────────────────────────────────
for (const boop of QA_BOOPS) {
  const to = hatched.get(boop.to);
  const from = hatched.get(boop.from) ?? null;
  const fromSpec = QA_PROFILES.find((p) => p.id === boop.from);
  if (!to) {
    console.log(`· boop ${boop.from} → ${boop.to}: skipped (recipient not hatched this run)`);
    continue;
  }
  if (!fromSpec || !wanted(fromSpec.id)) continue;
  const reachability = to.priv.boop;
  if (!reachability) continue;
  const persona = await personaFromViewPhrase(fromSpec.viewPhrase);
  const replyBox = { locator: randomLocator(), token: randomToken(), key: mintBoopBoxKey() };
  await client.createBoopInbox(replyBox.locator, replyBox.token);
  const content = buildBoop(
    'boop',
    { label: persona?.name ?? fromSpec.id, emoji: persona?.emoji ?? '🥚' },
    boop.intents,
    boop.attachViewPhrase ? { viewPhrase: fromSpec.viewPhrase } : undefined,
    replyBox,
  );
  await client.postKnock(
    reachability.inbox,
    await sealTo(boopPublicKey(reachability.priv), content),
  );
  if (from) {
    const sent: SentBoop = {
      id: crypto.randomUUID(),
      label: (await personaFromViewPhrase(to.spec.viewPhrase))?.name ?? to.spec.id,
      emoji: (await personaFromViewPhrase(to.spec.viewPhrase))?.emoji ?? '🥚',
      replyBox,
      sentAt: Date.now(),
      status: 'sent',
    };
    from.priv.sentBoops = [...(from.priv.sentBoops ?? []), sent];
  }
  console.log(`✚ boop ${boop.from} → ${boop.to}`);
}

// ── Final save: groups and sent boops into each fresh PrivData ─────────────
for (const entry of hatched.values()) {
  if (!entry.priv.groups?.length && !entry.priv.sentBoops?.length) continue;
  entry.version = await save(entry);
}

// ── Report ─────────────────────────────────────────────────────────────────
report['profiles'] = QA_PROFILES.filter((s) => wanted(s.id)).map((spec) => {
  const entry = hatched.get(spec.id);
  return {
    id: spec.id,
    role: spec.note,
    viewPhrase: spec.viewPhrase,
    viewUrl: viewUrlFor(spec.viewPhrase, appUrl()),
    status: entry ? 'hatched' : existing.has(spec.id) ? 'already present' : 'skipped',
    editPhrase: entry?.editPhrase,
  };
});
report['groups'] = groupSecrets;

console.log('\n─── QA cast ' + '─'.repeat(50));
for (const row of report['profiles'] as {
  id: string;
  viewUrl: string;
  status: string;
  editPhrase?: string;
}[]) {
  console.log(`${row.id.padEnd(8)} ${row.status.padEnd(15)} ${row.viewUrl}`);
  if (row.editPhrase) console.log(`${' '.repeat(9)}edit phrase: ${row.editPhrase}`);
}
for (const [id, secret] of Object.entries(groupSecrets)) {
  const g = secret as { groupPhrase: string; adminPhrase: string };
  console.log(`group ${id}: ${g.groupPhrase}\n${' '.repeat(9)}admin phrase: ${g.adminPhrase}`);
}

if (values.out) {
  writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `\nWrote ${values.out} — it holds live write credentials. Move them somewhere safe; do not commit it.`,
  );
}
if (hatched.size === 0)
  console.log(
    '\nNothing new was created. Edit phrases for existing profiles are not recoverable from here.',
  );

/**
 * A seed run makes far more writes in a minute than the server's per-IP
 * budget allows (MENAGERIE_WRITES_PER_MINUTE defaults to 30, and knocks get their
 * own smaller budget), so every call backs off and retries rather than
 * abandoning the run half-seeded. Wrapping the client keeps that one concern
 * out of the twenty call sites below.
 */
function throttled(inner: HatchClient): HatchClient {
  const retryable = new Set(['rate_limited', 'at_capacity']);
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          } catch (error) {
            const kind = error instanceof HatchError ? error.failure.kind : null;
            if (!kind || !retryable.has(kind) || attempt >= 5) throw error;
            const seconds = 10 * 2 ** attempt;
            console.log(`  ${kind} — waiting ${seconds}s`);
            await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
          }
        }
      };
    },
  }) as HatchClient;
}

/** Encrypt and PUT a hatched profile's current state. Mirrors the app's encryptState(). */
async function save(entry: Hatched): Promise<number> {
  const priv = entry.priv;
  const wantsTokens = Object.entries(priv.answers).some(
    ([k, v]) => k.startsWith('dp.') && typeof v === 'number' && v >= 1,
  );
  if (wantsTokens && !priv.desiresSalt) priv.desiresSalt = randomSalt();
  const tokens =
    wantsTokens && priv.desiresSalt ? await buildMatchTokens(priv.answers, priv.desiresSalt) : [];
  const payload = buildSharePayload(
    priv.answers,
    tokens,
    priv.desiresSalt,
    priv.weights ?? {},
    priv.acceptable ?? {},
    priv.boop ? { pub: boopPublicKey(priv.boop.priv), inbox: priv.boop.inbox } : undefined,
  );
  return client.put(entry.editKeys.editLocator, entry.editKeys.editToken, entry.version, {
    blob_view: await encryptBlob(payload, entry.viewKeys.viewKey),
    blob_priv: await encryptBlob(priv, entry.editKeys.editKey),
    populated: Object.keys(priv.answers).length > 0,
  });
}

/** Where the app lives, for the printed links — the server usually serves it. */
function appUrl(): string {
  return `${baseUrl!.replace(/\/+$/, '')}/`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
