import { describe, expect, test } from 'vitest';
import type { ChoiceItem, InterestItem, MultiItem, ScaleItem } from '../schema/types';
import { itemSimilarity } from './similarity';
import { buildGrid, pairScores } from './scores';
import { revealMutualDesires } from './reveal';
import { buildSharePayload } from '../codec/codec';
import { buildMatchTokens } from '../crypto/match-tokens';
import { randomSalt } from '../crypto/random';
import { sampleAnswers } from '../codec/codec.spec';

describe('similarity scoring', () => {
  test('behaves sensibly per item type', () => {
    const scale: ScaleItem = { id: 'x', type: 'scale', left: 'l', right: 'r' };
    expect(itemSimilarity(scale, 3, 3)).toBe(1);
    expect(itemSimilarity(scale, 0, 6)).toBe(0);
    expect(itemSimilarity(scale, 2, undefined)).toBeNull();

    const ord: ChoiceItem = { id: 'x', type: 'choice', label: 'x', ordinal: true, options: ['a', 'b', 'c', 'd'] };
    expect(itemSimilarity(ord, 1, 2)).toBe(1 - 1 / 3);
    const nom: ChoiceItem = { id: 'x', type: 'choice', label: 'x', options: ['a', 'b', 'c'] };
    expect(itemSimilarity(nom, 0, 2)).toBe(0);

    const multi: MultiItem = { id: 'x', type: 'multi', label: 'x', options: ['a', 'b', 'c', 'd'] };
    expect(itemSimilarity(multi, [0, 1], [1, 2])).toBe(1 / 3);

    const interest: InterestItem = { id: 'x', type: 'interest', label: 'x' };
    expect(itemSimilarity(interest, 3, 2)).toBeCloseTo(2 / 3, 9);
    expect(itemSimilarity(interest, 3, 0)).toBe(0);
    expect(itemSimilarity(interest, 0, 0), 'shared "not for me" is agreement').toBe(1);
  });
});

describe('pair scores and grid', () => {
  test('identical answers score ~1.0 and grid carries every answer', () => {
    const pa = buildSharePayload(sampleAnswers(), [], null);
    const pb = buildSharePayload(sampleAnswers(), [], null);
    const scores = pairScores(pa, pb);
    expect(scores.overall).toBeGreaterThan(0.99);

    const grid = buildGrid([pa, pb]);
    expect(grid.length).toBeGreaterThanOrEqual(5);
    const seeking = grid.find((g) => g.section.id === 'seeking')!;
    const friend = seeking.rows.find((r) => r.item.id === 'sk.friend')!;
    expect(friend.answers).toEqual([3, 3]);
    expect(friend.sim).toBe(1);
  });
});

describe('mutual desire reveal', () => {
  test('reveals only mutual items with both levels', async () => {
    const a = sampleAnswers(); // rope:3, cuddle:2, impact:0
    const b = { ...sampleAnswers(), 'dp.rope': 1, 'dp.cuddle': 0, 'dp.impact': 3 };
    const saltA = randomSalt();
    const saltB = randomSalt();
    const pa = buildSharePayload(a, await buildMatchTokens(a, saltA), saltA);
    const pb = buildSharePayload(b, await buildMatchTokens(b, saltB), saltB);

    const rows = await revealMutualDesires([pa, pb]);
    const ids = rows.map((r) => r.item.id);
    expect(ids).toContain('dp.rope'); // both positive → revealed
    expect(ids).not.toContain('dp.cuddle'); // one-sided → hidden
    expect(ids).not.toContain('dp.impact'); // one-sided → hidden

    const rope = rows.find((r) => r.item.id === 'dp.rope')!;
    expect(rope.levels).toEqual([3, 1]);
  });
});
