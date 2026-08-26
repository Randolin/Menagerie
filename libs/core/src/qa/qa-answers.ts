// Deterministic answer sets for the QA cast.
//
// Generated from the schema rather than hardcoded, so the cast keeps working
// as sections.ts grows: a new item is answered on the next re-seed instead of
// silently leaving a hole. (Answers) + (mode, seed) is a pure function, which
// is what makes twins twins and the mirror an exact inversion.
import {
  SCALE_MAX,
  type Acceptable,
  type AnswerValue,
  type Answers,
  type Item,
  type Weights,
} from '../schema/types';
import { allItems, coreItems, openItems } from '../schema/schema';
import type { QaAnswerMode } from './qa-profiles';

export interface QaAnswerSet {
  readonly answers: Answers;
  readonly weights: Weights;
  readonly acceptable: Acceptable;
}

/** mulberry32 — small, seedable, and good enough to spread option indexes. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function answerFor(item: Item, rand: () => number): AnswerValue {
  switch (item.type) {
    case 'choice':
      return Math.floor(rand() * item.options.length);
    case 'multi': {
      const picked = item.options.map((_, i) => i).filter(() => rand() < 0.4);
      // An empty multi is dropped by buildSharePayload — always say something.
      return picked.length ? picked : [Math.floor(rand() * item.options.length)];
    }
    case 'scale':
      return Math.floor(rand() * (SCALE_MAX + 1));
    case 'interest':
      return Math.floor(rand() * 4);
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

/** The opposite end of the same item — the compare floor. */
function invert(item: Item, value: AnswerValue): AnswerValue {
  switch (item.type) {
    case 'choice':
      return item.options.length - 1 - (value as number);
    case 'multi': {
      const chosen = new Set(value as readonly number[]);
      const complement = item.options.map((_, i) => i).filter((i) => !chosen.has(i));
      // Every option chosen leaves nothing to invert to; keep the original.
      return complement.length ? complement : (value as readonly number[]);
    }
    case 'scale':
      return SCALE_MAX - (value as number);
    case 'interest':
      return 3 - (value as number);
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

/**
 * Importance for the 'full' mode: the first two open choice items with room
 * to exclude something get weighted, the second as a dealbreaker whose
 * acceptable set is its own answer. A dealbreaker that excludes nothing (or
 * everything) is demoted to 2 by buildSharePayload, so the set has to be a
 * proper subset for the `d` map to appear at all.
 */
function weightsFor(answers: Answers): { weights: Weights; acceptable: Acceptable } {
  const weights: Weights = {};
  const acceptable: Acceptable = {};
  const candidates = openItems()
    .map(({ item }) => item)
    .filter((item) => item.type === 'choice' && item.options.length >= 3)
    .slice(0, 2);
  const [mattersALot, dealbreaker] = candidates;
  if (mattersALot) weights[mattersALot.id] = 2;
  if (dealbreaker) {
    weights[dealbreaker.id] = 3;
    acceptable[dealbreaker.id] = [answers[dealbreaker.id] as number];
  }
  return { weights, acceptable };
}

export function qaAnswerSet(mode: QaAnswerMode, seed: number): QaAnswerSet {
  const rand = prng(seed);
  const answers: Answers = {};

  if (mode === 'minimal') {
    const first = coreItems()[0];
    if (first) answers[first.item.id] = answerFor(first.item, rand);
    return { answers, weights: {}, acceptable: {} };
  }

  const items = mode === 'core-only' ? coreItems() : allItems();
  for (const { item } of items) {
    const value = answerFor(item, rand);
    answers[item.id] = mode === 'mirror' ? invert(item, value) : value;
  }

  if (mode !== 'full') return { answers, weights: {}, acceptable: {} };
  const { weights, acceptable } = weightsFor(answers);
  return { answers, weights, acceptable };
}
