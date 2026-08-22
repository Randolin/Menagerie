// Person-identity encoding: categorical slots in fixed order, never cycled.
// Comparison is capped at four people, matching the four validated slots.
export const MAX_COMPARE = 4;

export function seriesVar(i: number): string {
  return `var(--series-${(i % MAX_COMPARE) + 1})`;
}
