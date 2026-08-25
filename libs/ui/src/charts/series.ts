// Person-identity encoding: categorical slots in fixed order, never cycled.
// Comparison is capped at four people, matching the four validated slots.
export const MAX_COMPARE = 4;

export function seriesVar(i: number): string {
  return `var(--series-${(i % MAX_COMPARE) + 1})`;
}

/** Clamp to [0, 1] — chart inputs are scores that must never paint outside the frame. */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** A 0..1 score as a rounded percentage. */
export function pct(score: number): number {
  return Math.round(score * 100);
}
