import { describe, expect, test } from 'vitest';
import type { Answers, ProfilePayloadV1 } from '../schema/types';
import { buildSharePayload } from './codec';
import { migrateToCurrent } from './migrate';
import { buildMatchTokens, probeLevel } from '../crypto/match-tokens';
import { randomSalt } from '../crypto/random';

export function sampleAnswers(): Answers {
  return {
    'ab.pn': [2],
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
    'ls.tuesday': [1, 5, 8],
    'cn.give': [1, 2],
    'cn.receive': [2],
    'st.ideal': [3, 4],
    'pl.cohabit': 2,
    'dp.rope': 3, // match-only
    'dp.cuddle': 2, // match-only
    'dp.impact': 0, // match-only, negative — must never appear anywhere
  };
}

describe('share payload', () => {
  test('strips match-only answers; desires travel only as tokens', async () => {
    const answers = sampleAnswers();
    const salt = randomSalt();
    const tokens = await buildMatchTokens(answers, salt);
    const payload = buildSharePayload(answers, tokens, salt);

    expect(payload.a['dp.rope'], 'desires must not leak into open answers').toBeUndefined();
    expect(payload.a['dp.cuddle']).toBeUndefined();
    expect(payload.a['ab.pn']).toEqual([2]);
    expect(payload.s).toBe(salt);
    expect(payload.m?.length).toBe(tokens.length);
    expect(payload.w).toBeUndefined();
    expect(payload.d).toBeUndefined();

    // The positive desires are probeable, the negative one never is.
    expect(await probeLevel(payload, 'dp.rope')).toBe(3);
    expect(await probeLevel(payload, 'dp.cuddle')).toBe(2);
    expect(await probeLevel(payload, 'dp.impact')).toBe(0);

    // Serialized-then-migrated round trip (what view decryption does).
    expect(migrateToCurrent(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  test('no positive desires → no salt, no tokens', () => {
    const payload = buildSharePayload({ 'ab.age': 2, 'dp.rope': 0 }, [], null);
    expect(payload.s).toBeUndefined();
    expect(payload.m).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('dp.');
  });

  test('weights ride along only for answered items, normalized defensively', () => {
    const payload = buildSharePayload(
      {
        'ls.smoke': 0,
        'ls.kids': 3,
        'va.together': 5,
        'sk.mono': 3,
        'ab.age': 1,
      },
      [],
      null,
      {
        'ls.smoke': 3, // dealbreaker with a valid acceptable set
        'ls.kids': 1, // matters
        'va.together': 3, // scale — caps at 2
        'sk.mono': 3, // dealbreaker without acceptable set — downgrades
        'ls.diet': 2, // unanswered — dropped
        'ab.age': 3, // acceptable set covers every option — downgrades
      },
      {
        'ls.smoke': [0, 1],
        'ab.age': [0, 1, 2, 3, 4, 5],
      },
    );
    expect(payload.w).toEqual({
      'ls.smoke': 3,
      'ls.kids': 1,
      'va.together': 2,
      'sk.mono': 2,
      'ab.age': 2,
    });
    expect(payload.d).toEqual({ 'ls.smoke': [0, 1] });
  });

  test('migrates a v1 payload: text drops, pronouns and affection remap', () => {
    const v1: ProfilePayloadV1 = {
      v: 1,
      a: {
        'ab.name': 'River',
        'ab.pronouns': 'they/them',
        'ab.intro': 'a few lines',
        'nt.musthave': 'kindness',
        'cn.affection': [1, 2],
        'ab.age': 1,
        'va.together': 4,
      },
    };
    const migrated = migrateToCurrent(JSON.parse(JSON.stringify(v1)));
    expect(migrated.v).toBe(2);
    expect(migrated.a).toEqual({
      'ab.pn': [2], // 'they/them' is option index 2
      'cn.give': [1, 2],
      'ab.age': 1,
      'va.together': 4,
    });
  });

  test('migrates v1 pronouns it cannot map by dropping them', () => {
    const migrated = migrateToCurrent({
      v: 1,
      a: { 'ab.pronouns': 'ze/zir', 'ab.age': 0 },
    });
    expect(migrated.a).toEqual({ 'ab.age': 0 });
  });

  test('migrate guards malformed and future payloads', () => {
    expect(() => migrateToCurrent(null)).toThrow(/Malformed/);
    expect(() => migrateToCurrent({ a: {} })).toThrow(/version/);
    expect(() => migrateToCurrent({ v: 99, a: {} })).toThrow(/newer/);
    expect(() => migrateToCurrent({ v: 2 })).toThrow(/answers/);
  });
});
