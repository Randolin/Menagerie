import type { InterestItem, InterestLevel, ProfilePayload } from '../schema/types';
import { SECTIONS } from '../schema/sections';
import { probeLevel } from '../crypto/match-tokens';

export interface DesireReveal {
  readonly item: InterestItem;
  readonly levels: readonly InterestLevel[];
}

/**
 * Mutual-reveal for the desires section. For each match-only item, probe each
 * payload's token set; reveal only the items where at least two people are at
 * level >= 1. Levels of non-mutual items are withheld entirely — neither side
 * learns the other was asked.
 */
export async function revealMutualDesires(
  payloads: readonly ProfilePayload[],
): Promise<DesireReveal[]> {
  const rows: DesireReveal[] = [];
  const desires = SECTIONS.find((s) => s.id === 'desires');
  if (!desires) return rows;
  for (const item of desires.items) {
    if (item.type !== 'interest') continue;
    const levels: InterestLevel[] = [];
    for (const p of payloads) levels.push(await probeLevel(p, item.id));
    const positive = levels.filter((l) => l >= 1).length;
    if (positive >= 2) rows.push({ item, levels });
  }
  // Warmest mutual matches first.
  const warmth = (r: DesireReveal) => Math.min(...r.levels.filter((l) => l >= 1));
  rows.sort((x, y) => warmth(y) - warmth(x));
  return rows;
}

export function hasDesiresTokens(payload: ProfilePayload): boolean {
  return Boolean(payload.m && payload.m.length && payload.s);
}
