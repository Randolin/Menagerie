// Everything the compare panels render, precomputed once per entry-set
// change so panels stay pure presentations.
import {
  buildGrid,
  COMPLEMENT_PAIRS,
  getItem,
  hasDesiresTokens,
  interlockScore,
  pairScores,
  revealMutualDesires,
  type ComplementPair,
  type DesireReveal,
  type GridSection,
  type PairScores,
  type Persona,
  type ProfilePayload,
} from '@moxy/core';

/** One fetched-and-decrypted comparison source (or its failure). */
export interface CompareSlot {
  /** The view phrase it was loaded from, or a snapshot's label. */
  readonly ref: string;
  readonly payload?: ProfilePayload;
  readonly persona?: Persona | null;
  /** Group-snapshot identity when no persona exists (pseudonym + emoji). */
  readonly label?: string;
  readonly emoji?: string | null;
  readonly error?: string;
}

/** Option-level detail of one interlock direction: giver → receiver. */
export interface InterlockDetail {
  /** Option labels shared by the give/receive pair. */
  readonly options: readonly string[];
  /** Option indexes the giver naturally gives. */
  readonly gives: readonly number[];
  /** Option indexes the receiver needs. */
  readonly needs: readonly number[];
  /** Needs the giver covers. */
  readonly matched: readonly number[];
  /** Needs left uncovered. */
  readonly unmet: readonly number[];
}

/** One give/receive interlock, resolved for a pair. */
export interface InterlockRow {
  readonly label: string;
  /** How well person B covers person A's needs (0..1), or null. */
  readonly forA: number | null;
  /** How well person A covers person B's needs (0..1), or null. */
  readonly forB: number | null;
  /** Detail for the B→A direction (present when forA is not null). */
  readonly detailA?: InterlockDetail;
  /** Detail for the A→B direction (present when forB is not null). */
  readonly detailB?: InterlockDetail;
}

export interface CompareModel {
  readonly slots: readonly CompareSlot[];
  /** Successfully loaded payloads, in slot order. */
  readonly payloads: readonly ProfilePayload[];
  readonly names: readonly string[];
  /** Aligned with payloads/names; null when a slot carries no persona. */
  /** Aligned with names: persona emoji, or a snapshot's pseudonym emoji. */
  readonly emojis: readonly (string | null)[];
  readonly grid: readonly GridSection[];
  /** Pair scores when exactly two payloads decoded, else null. */
  readonly pair: PairScores | null;
  /** Give/receive interlocks for the pair case. */
  readonly interlocks: readonly InterlockRow[];
  /** Pairwise overall matrix (for 3+). */
  readonly pairwise: readonly (readonly (number | null)[])[];
  readonly mutualSeekingCount: number;
  readonly desireRows: readonly DesireReveal[];
  readonly withTokensCount: number;
}

function interlockDetail(
  giver: ProfilePayload,
  receiver: ProfilePayload,
  cp: ComplementPair,
): InterlockDetail | undefined {
  const gives = giver.a[cp.give];
  const needs = receiver.a[cp.receive];
  if (!Array.isArray(gives) || !Array.isArray(needs) || needs.length === 0) {
    return undefined;
  }
  const options = (getItem(cp.receive)?.item as { options?: readonly string[] })?.options ?? [];
  const asc = (a: number, b: number) => a - b;
  const given = new Set(gives);
  return {
    options,
    gives: [...gives].sort(asc),
    needs: [...needs].sort(asc),
    matched: needs.filter((i) => given.has(i)).sort(asc),
    unmet: needs.filter((i) => !given.has(i)).sort(asc),
  };
}

export async function buildCompareModel(slots: readonly CompareSlot[]): Promise<CompareModel> {
  const good = slots.filter((s) => s.payload);
  const payloads = good.map((s) => s.payload!);
  // The creature IS the name — profiles carry no nickname by design.
  // Group snapshots identify by their pseudonym instead.
  const names = good.map((s, i) => s.persona?.name ?? s.label ?? `Creature ${'ABCD'[i] ?? i + 1}`);
  const emojis = good.map((s) => s.persona?.emoji ?? s.emoji ?? null);
  const grid = payloads.length >= 2 ? buildGrid(payloads) : [];

  const pair = payloads.length === 2 ? pairScores(payloads[0], payloads[1]) : null;
  const interlocks: InterlockRow[] =
    payloads.length === 2
      ? COMPLEMENT_PAIRS.map((cp) => {
          const forA = interlockScore(payloads[1], payloads[0], cp);
          const forB = interlockScore(payloads[0], payloads[1], cp);
          return {
            label: cp.label,
            forA,
            forB,
            detailA: forA === null ? undefined : interlockDetail(payloads[1], payloads[0], cp),
            detailB: forB === null ? undefined : interlockDetail(payloads[0], payloads[1], cp),
          };
        }).filter((row) => row.forA !== null || row.forB !== null)
      : [];
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
    emojis,
    grid,
    pair,
    interlocks,
    pairwise,
    mutualSeekingCount,
    desireRows,
    withTokensCount,
  };
}
