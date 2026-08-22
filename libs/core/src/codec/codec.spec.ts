import { describe, expect, test } from 'vitest';
import type { Answers } from '../schema/types';
import { allItems } from '../schema/schema';
import {
  buildSharePayload,
  decodePayload,
  encodePayload,
  extractPayloadString,
  shareUrlFor,
} from './codec';
import { buildMatchTokens, probeLevel } from '../crypto/match-tokens';
import { randomSalt } from '../crypto/random';
import legacyProfile from './fixtures/legacy-profile.json';
import legacyCompare from './fixtures/legacy-compare.json';

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

describe('codec', () => {
  test('round-trips a payload and strips match-only answers', async () => {
    const answers = sampleAnswers();
    const salt = randomSalt();
    const tokens = await buildMatchTokens(answers, salt);
    const payload = buildSharePayload(answers, tokens, salt);

    expect(payload.a['dp.rope'], 'desires must not leak into open answers').toBeUndefined();
    expect(payload.a['ab.name']).toBe('River');

    const encoded = await encodePayload(payload);
    expect(encoded).toMatch(/^m1\.[A-Za-z0-9_-]+$/);
    const decoded = await decodePayload(encoded);
    expect(decoded).toEqual(payload);

    // Extraction from a full URL and from surrounding prose.
    const url = shareUrlFor(encoded, 'https://example.org/moxy/');
    expect(extractPayloadString(`check me out: ${url} !!`)).toBe(encoded);

    // Codes must survive URL encoding untouched (router-segment safety).
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  test('payload stays small enough for a QR code', async () => {
    // Fully answered profile — worst case.
    const answers: Answers = {};
    for (const { item } of allItems()) {
      if (item.type === 'text') {
        answers[item.id] =
          'Some reasonably wordy free text answer, twice over. Some reasonably wordy free text answer.';
      } else if (item.type === 'multi') answers[item.id] = [0, 1, 2];
      else if (item.type === 'scale') answers[item.id] = 3;
      else if (item.type === 'interest') answers[item.id] = 2;
      else answers[item.id] = 1;
    }
    const salt = randomSalt();
    const tokens = await buildMatchTokens(answers, salt);
    const payload = buildSharePayload(answers, tokens, salt);
    const encoded = await encodePayload(payload);
    // QR version 40 (error level L) fits 2953 bytes; leave headroom for the URL.
    expect(encoded.length).toBeLessThan(2400);
  });

  test('persona seed travels in payload.e, never in open answers, within QR budget', async () => {
    const answers = { ...sampleAnswers(), _persona: 'AbCd12_-' };
    const payload = buildSharePayload(answers, [], null);
    expect(payload.e).toBe('AbCd12_-');
    expect(payload.a['_persona'], 'reserved key must not leak into answers').toBeUndefined();

    const decoded = await decodePayload(await encodePayload(payload));
    expect(decoded.e).toBe('AbCd12_-');

    // Invalid/absent seeds are dropped silently.
    expect(buildSharePayload({ ...sampleAnswers(), _persona: 'nope' }, [], null).e).toBeUndefined();
    expect(buildSharePayload(sampleAnswers(), [], null).e).toBeUndefined();
  });

  test('rejects payloads from a future format version', async () => {
    const encoded = await encodePayload({ v: 99, a: {} } as never);
    await expect(decodePayload(encoded)).rejects.toThrow(/newer Moxy version/);
  });

  test('LEGACY ORACLE: decodes a payload produced by the vanilla-JS app byte-identically', async () => {
    const decoded = await decodePayload(legacyProfile.code);
    expect(decoded).toEqual(legacyProfile.expectedPayload);
    // Token probe parity with the legacy implementation.
    for (const probe of legacyProfile.probes) {
      expect(
        await probeLevel(decoded, probe.itemId),
        `probe ${probe.itemId}`,
      ).toBe(probe.level);
    }
    // The compare fixture's codes decode too.
    for (const code of legacyCompare.codes) {
      await expect(decodePayload(code)).resolves.toBeTruthy();
    }
  });
});
