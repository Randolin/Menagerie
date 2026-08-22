// Everything the compare panels render, precomputed once per code-set change
// so panels stay pure presentations.
import {
  buildGrid,
  decodePayload,
  displayName,
  hasDesiresTokens,
  pairScores,
  personaFromPayload,
  revealMutualDesires,
  type DesireReveal,
  type GridSection,
  type PairScores,
  type Persona,
  type ProfilePayload,
} from '@moxy/core';

export interface CompareSlot {
  readonly code: string;
  readonly payload?: ProfilePayload;
  readonly error?: string;
}

export interface CompareModel {
  readonly slots: readonly CompareSlot[];
  /** Successfully decoded payloads, in slot order. */
  readonly payloads: readonly ProfilePayload[];
  readonly names: readonly string[];
  /** Aligned with payloads/names; null when a payload carries no persona. */
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

export async function buildCompareModel(codes: readonly string[]): Promise<CompareModel> {
  const slots: CompareSlot[] = [];
  for (const code of codes) {
    try {
      slots.push({ code, payload: await decodePayload(code) });
    } catch (err) {
      slots.push({ code, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const payloads = slots.flatMap((s) => (s.payload ? [s.payload] : []));
  const names = payloads.map((p, i) => displayName(p, `Person ${'ABCD'[i] ?? i + 1}`));
  const personas = await Promise.all(payloads.map((p) => personaFromPayload(p)));
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
