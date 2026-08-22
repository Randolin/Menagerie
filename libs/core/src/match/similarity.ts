// Per-item-type similarity in [0, 1], or null when not comparable
// (unanswered on either side, or a display-only type).
//
// Adding a new item TYPE requires an entry here — the exhaustive switch makes
// forgetting it a compile error.
import type { AnswerValue, Item } from '../schema/types';

export function itemSimilarity(
  item: Item,
  a: AnswerValue | null | undefined,
  b: AnswerValue | null | undefined,
): number | null {
  if (a === undefined || b === undefined || a === null || b === null) return null;
  switch (item.type) {
    case 'scale':
      return 1 - Math.abs((a as number) - (b as number)) / 6;
    case 'interest':
      // Agreement, not mutual enthusiasm: two people who both answered
      // "not for me" agree perfectly. Mutual-interest highlighting is a
      // display concern, handled by the seeking matrix.
      return 1 - Math.abs((a as number) - (b as number)) / 3;
    case 'choice': {
      if (a === b) return 1;
      if (item.ordinal && item.options.length > 1) {
        return 1 - Math.abs((a as number) - (b as number)) / (item.options.length - 1);
      }
      return 0;
    }
    case 'multi': {
      const A = new Set(Array.isArray(a) ? a : []);
      const B = new Set(Array.isArray(b) ? b : []);
      if (A.size === 0 && B.size === 0) return null;
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = A.size + B.size - inter;
      return union === 0 ? null : inter / union;
    }
    case 'text':
      return null;
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
