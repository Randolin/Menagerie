import { describe, expect, test } from 'vitest';
import { buildSharePayload } from '../codec/codec';
import { buildMatchTokens, probeLevel } from './match-tokens';
import { randomSalt } from './random';
import { generatePassphrase } from './passphrase';
import { sampleAnswers } from '../codec/codec.spec';

describe('match tokens', () => {
  test('mutual desires reveal, one-sided ones stay hidden', async () => {
    const a = sampleAnswers(); // rope:3, cuddle:2, impact:0
    const b = { ...sampleAnswers(), 'dp.rope': 1, 'dp.cuddle': 0, 'dp.impact': 3 };

    const saltA = randomSalt();
    const saltB = randomSalt();
    const pa = buildSharePayload(a, await buildMatchTokens(a, saltA), saltA);
    const pb = buildSharePayload(b, await buildMatchTokens(b, saltB), saltB);

    // Both positive → discoverable at each side's true level.
    expect(await probeLevel(pa, 'dp.rope')).toBe(3);
    expect(await probeLevel(pb, 'dp.rope')).toBe(1);

    // Level-0 answers must not be probeable, ever.
    expect(await probeLevel(pa, 'dp.impact')).toBe(0);
    expect(await probeLevel(pb, 'dp.cuddle')).toBe(0);

    // Token sets are padded to a multiple of 8 (count is not a signal).
    expect(pa.m!.length % 8).toBe(0);
    expect(pb.m!.length % 8).toBe(0);
  });

  test('two shares of the same answers are unlinkable via tokens', async () => {
    const answers = sampleAnswers();
    const t1 = await buildMatchTokens(answers, randomSalt());
    const t2 = await buildMatchTokens(answers, randomSalt());
    expect(t1.filter((t) => t2.includes(t))).toEqual([]);
  });

  test('no positive desires → no tokens at all', async () => {
    const answers = { ...sampleAnswers(), 'dp.rope': 0, 'dp.cuddle': 0 };
    delete (answers as Record<string, unknown>)['dp.impact'];
    const tokens = await buildMatchTokens(answers, randomSalt());
    expect(tokens).toEqual([]);
    const payload = buildSharePayload(answers, tokens, randomSalt());
    expect(payload.m).toBeUndefined();
    expect(payload.s).toBeUndefined();
  });
});

describe('passphrase generation', () => {
  test('emits five distinct-draw words', async () => {
    const p = await generatePassphrase(5);
    expect(p.split(' ')).toHaveLength(5);
    const p2 = await generatePassphrase(5);
    expect(p2).not.toBe(p);
  });
});
