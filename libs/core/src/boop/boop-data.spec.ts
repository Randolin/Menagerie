import { describe, expect, test } from 'vitest';
import {
  BOOP_INTENTS,
  CONTACT_PLATFORMS,
  buildBoop,
  migrateBoopContent,
  validContactHandle,
} from './boop-data';
import { buildSharePayload } from '../codec/codec';
import { buildDeposit } from '../group/group-data';
import { migratePrivData, type PrivData } from '../hatch/priv-data';

const FROM = { label: 'amber-fox', emoji: '🦊' };

describe('boop content', () => {
  test('build keeps only valid, deduplicated intent indexes', () => {
    const boop = buildBoop('boop', FROM, [0, 0, 2, -1, 99, 1.5]);
    expect(boop.intents).toEqual([0, 2]);
    expect(boop.attachments).toBeUndefined();
    expect(boop.replyBox).toBeUndefined();
  });

  test('contact cards demand a listed platform and a plain handle', () => {
    const good = buildBoop('boop', FROM, [0], {
      contact: { platform: 0, handle: 'amber.fox.77' },
    });
    expect(good.attachments?.contact).toEqual({ platform: 0, handle: 'amber.fox.77' });
    expect(() =>
      buildBoop('boop', FROM, [0], { contact: { platform: CONTACT_PLATFORMS.length, handle: 'x' } }),
    ).toThrow(/contact/i);
    expect(() =>
      buildBoop('boop', FROM, [0], { contact: { platform: 0, handle: 'has space' } }),
    ).toThrow(/contact/i);
    expect(() =>
      buildBoop('boop', FROM, [0], { contact: { platform: 0, handle: 'https://evil.example' } }),
    ).toThrow(/contact/i);
    expect(validContactHandle('a'.repeat(65))).toBe(false);
    expect(validContactHandle('a'.repeat(64))).toBe(true);
  });

  test('migrate round-trips a full boop and rejects unknown shapes', () => {
    const boop = buildBoop(
      'boop',
      FROM,
      [0, 1],
      { viewPhrase: 'amber azure fox mistwoven emberlit fernhollow' },
      { locator: 'L'.repeat(22), token: 'T'.repeat(22), key: 'K'.repeat(43) },
    );
    expect(migrateBoopContent(JSON.parse(JSON.stringify(boop)))).toEqual(boop);
    expect(() => migrateBoopContent(null)).toThrow();
    expect(() => migrateBoopContent({ v: 2, kind: 'boop' })).toThrow(/version/i);
    expect(() => migrateBoopContent({ v: 1, kind: 'shout', from: FROM, intents: [] })).toThrow();
    expect(() =>
      migrateBoopContent({ v: 1, kind: 'boop', from: { label: '', emoji: '' }, intents: [] }),
    ).toThrow();
  });

  test('the intent list stays small and fixed-order (indexes are the wire format)', () => {
    // Appending is fine; reordering or removing breaks knocks already in flight.
    expect(BOOP_INTENTS.slice(0, 3)).toEqual([
      'Curious to connect',
      'We seem compatible',
      'Open to chatting elsewhere',
    ]);
    expect(CONTACT_PLATFORMS[0]).toBe('Signal');
  });
});

describe('boop reachability placement', () => {
  const ANSWERS = { 'ab.age': 2 };
  const KEY = { pub: 'P'.repeat(87), inbox: 'I'.repeat(22) };

  test('the view-blob path publishes k only when handed one', () => {
    expect(buildSharePayload(ANSWERS, [], null).k).toBeUndefined();
    expect(buildSharePayload(ANSWERS, [], null, {}, {}, KEY).k).toEqual(KEY);
  });

  test('group deposits can never carry boop reachability', () => {
    // A deposit snapshot sharing the profile's pub key or inbox locator
    // would let anyone who knows the view phrase unmask the pseudonym.
    // buildDeposit must keep calling buildSharePayload WITHOUT the boop arg.
    const deposit = buildDeposit(
      1,
      ANSWERS,
      {},
      {},
      undefined,
      { pseudonym: 'dusk-otter', emoji: '🦦' },
      Date.now(),
    );
    expect(deposit.snapshot.k).toBeUndefined();
    expect(JSON.stringify(deposit)).not.toContain(KEY.inbox);
  });
});

describe('priv-data pass-through', () => {
  test('boop fields survive migration of an old-shaped blob untouched', () => {
    const stored = {
      v: 1,
      viewPhrase: 'amber azure fox mistwoven emberlit fernhollow',
      answers: {},
      desiresSalt: null,
      connections: [],
      boop: { priv: 'p', inbox: 'i', token: 't' },
      sentBoops: [
        {
          id: 'x',
          label: 'dusk-otter',
          emoji: '🦦',
          replyBox: { locator: 'l', token: 't', key: 'k' },
          sentAt: 1,
          status: 'sent',
        },
      ],
    };
    const migrated: PrivData = migratePrivData(JSON.parse(JSON.stringify(stored)));
    expect(migrated.boop).toEqual(stored.boop);
    expect(migrated.sentBoops).toEqual(stored.sentBoops);
    // And a pre-boop blob simply has neither.
    const legacy = migratePrivData({ v: 1, viewPhrase: 'x', answers: {}, desiresSalt: null, connections: [] });
    expect(legacy.boop).toBeUndefined();
    expect(legacy.sentBoops).toBeUndefined();
  });
});
