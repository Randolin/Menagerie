// Everything the compare panels render, precomputed once per entry-set
// change so panels stay pure presentations.
import {
  buildGrid,
  displayName,
  hasDesiresTokens,
  pairScores,
  revealMutualDesires,
  type DesireReveal,
  type GridSection,
  type PairScores,
  type Persona,
  type ProfilePayload,
} from '@moxy/core';

/** One fetched-and-decrypted comparison source (or its failure). */
export interface CompareSlot {
  /** The view phrase it was loaded from. */
  readonly ref: string;
  readonly payload?: ProfilePayload;
  readonly persona?: Persona | null;
  readonly error?: string;
}

export interface CompareModel {
  readonly slots: readonly CompareSlot[];
  /** Successfully loaded payloads, in slot order. */
  readonly payloads: readonly ProfilePayload[];
  readonly names: readonly string[];
  /** Aligned with payloads/names; null when a slot carries no persona. */
  readonly personas: readonly (Persona | null)[];
  readonly grid: readonly GridSection[];
  /** Pair scores when exactly two payloads decoded, else null. */
  readonly pair: PairScores | null;
  /** Pairwise overall matrix (for 3+). */
  readonly pairwise: readonly (readonly (number | null)[])[];
  readonly mutualSeekingCount: number;
  readonly desireRows: readonly DesireReveal[];
  readonly withTokensCount: number;
}

export async function buildCompareModel(slots: readonly CompareSlot[]): Promise<CompareModel> {
  const good = slots.filter((s) => s.payload);
  const payloads = good.map((s) => s.payload!);
  const names = payloads.map((p, i) => displayName(p, `Person ${'ABCD'[i] ?? i + 1}`));
  const personas = good.map((s) => s.persona ?? null);
  const grid = payloads.length >= 2 ? buildGrid(payloads) : [];

  const pair = payloads.length === 2 ? pairScores(payloads[0], payloads[1]) : null;
  const pairwise = payloads.map((_, i) =>
    payloads.map((_, j) => (i === j ? null : pairScores(payloads[i], payloads[j]).overall)),
  );

  let mutualSeekingCount = 0;
  const seeking = grid.find((g) => g.section.id === 'seeking');
  if (seeking) {
    for (const row of seeking.rows) {
      const answered = row.answers.filter((v): v is number => typeof v === 'number');
      if (answered.length >= 2 && Math.min(...answered) >= 2) mutualSeekingCount++;
    }
  }

  const withTokensCount = payloads.filter(hasDesiresTokens).length;
  const desireRows =
    payloads.length >= 2 && withTokensCount >= 2 ? await revealMutualDesires(payloads) : [];

  return {
    slots,
    payloads,
    names,
    personas,
    grid,
    pair,
    pairwise,
    mutualSeekingCount,
    desireRows,
    withTokensCount,
  };
}
