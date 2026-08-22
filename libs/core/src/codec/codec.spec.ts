import { describe, expect, test } from 'vitest';
import type { Answers } from '../schema/types';
import { buildSharePayload } from './codec';
import { migrateToCurrent } from './migrate';
import { buildMatchTokens, probeLevel } from '../crypto/match-tokens';
import { randomSalt } from '../crypto/random';

export function sampleAnswers(): Answers {
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
    expect(payload.a['ab.name']).toBe('River');
    expect(payload.s).toBe(salt);
    expect(payload.m?.length).toBe(tokens.length);

    // The positive desires are probeable, the negative one never is.
    expect(await probeLevel(payload, 'dp.rope')).toBe(3);
    expect(await probeLevel(payload, 'dp.cuddle')).toBe(2);
    expect(await probeLevel(payload, 'dp.impact')).toBe(0);

    // Serialized-then-migrated round trip (what view decryption does).
    expect(migrateToCurrent(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  test('no positive desires → no salt, no tokens', () => {
    const payload = buildSharePayload({ 'ab.name': 'Sam', 'dp.rope': 0 }, [], null);
    expect(payload.s).toBeUndefined();
    expect(payload.m).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('dp.');
  });

  test('migrate guards malformed and future payloads', () => {
    expect(() => migrateToCurrent(null)).toThrow(/Malformed/);
    expect(() => migrateToCurrent({ a: {} })).toThrow(/version/);
    expect(() => migrateToCurrent({ v: 99, a: {} })).toThrow(/newer/);
  });
});
