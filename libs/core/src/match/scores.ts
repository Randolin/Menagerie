import type { AnswerValue, Item, ProfilePayload, Section } from '../schema/types';
import { SECTIONS } from '../schema/sections';
import { itemSimilarity } from './similarity';
import { COMPLEMENT_PAIRS, interlockScore } from './complement';

export const SECTION_WEIGHTS: Readonly<Record<string, number>> = {
  seeking: 0.25,
  values: 0.3,
  lifestyle: 0.2,
  connection: 0.15,
  structure: 0.1,
  plans: 0.1,
};

/** Extra emphasis a scorer's importance weight puts on an item. */
const IMPORTANCE_MULTIPLIER: Readonly<Record<number, number>> = {
  1: 2, // matters
  2: 4, // matters a lot
  3: 4, // dealbreaker (plus the violation gate below)
};

export interface SectionScore {
  readonly score: number;
  readonly answered: number;
}

/** One side's weighted view of the fit: how well the OTHER person fits THEM. */
export interface DirectionalFit {
  readonly sections: Record<string, SectionScore>;
  readonly overall: number | null;
  /** Item ids where the other person's answer violates this side's dealbreaker. */
  readonly alerts: readonly string[];
}

export interface PairScores {
  /** Symmetric, unweighted — what the meters and fingerprints display. */
  readonly sections: Record<string, SectionScore>;
  readonly overall: number | null;
  /** Fit of b for a, scored by a's importance weights. */
  readonly fitA: DirectionalFit;
  /** Fit of a for b, scored by b's importance weights. */
  readonly fitB: DirectionalFit;
  /** Open items answered by both — the honest basis of every number above. */
  readonly coverage: number;
}

/** Does `answer` fall outside the owner's acceptable set for a dealbreaker? */
function violatesDealbreaker(
  acceptable: readonly number[] | undefined,
  answer: AnswerValue | undefined,
): boolean {
  if (!acceptable || answer === undefined || answer === null) return false;
  const ok = new Set(acceptable);
  if (typeof answer === 'number') return !ok.has(answer);
  // Multi: violated only when the other person shares NOTHING acceptable.
  return answer.length > 0 && !answer.some((i) => ok.has(i));
}

/** Items that complementarity scoring owns; skipped in directional similarity. */
const COMPLEMENT_ITEM_IDS = new Set(COMPLEMENT_PAIRS.flatMap((p) => [p.give, p.receive]));

function weightedOverall(sections: Record<string, SectionScore>): number | null {
  let wsum = 0;
  let w = 0;
  for (const [id, weight] of Object.entries(SECTION_WEIGHTS)) {
    const s = sections[id];
    if (s) {
      wsum += s.score * weight;
      w += weight;
    }
  }
  return w > 0 ? wsum / w : null;
}

/**
 * One direction: how well `other` fits `owner`, by the owner's weights.
 * Give/receive pairs are scored as interlocks (their giving vs the owner's
 * needs) instead of same-item similarity; a violated dealbreaker zeroes its
 * item at full multiplier and raises an alert.
 */
function directionalFit(owner: ProfilePayload, other: ProfilePayload): DirectionalFit {
  const weights = owner.w ?? {};
  const acceptable = owner.d ?? {};
  const alerts: string[] = [];
  const sections: Record<string, SectionScore> = {};

  for (const section of SECTIONS) {
    if (section.privacy !== 'open') continue;
    let sum = 0;
    let mass = 0;
    let answered = 0;
    for (const item of section.items) {
      let sim: number | null;
      if (COMPLEMENT_ITEM_IDS.has(item.id)) {
        const pair = COMPLEMENT_PAIRS.find((p) => p.receive === item.id);
        if (!pair) continue; // 'give' side counts in the other direction
        sim = interlockScore(other, owner, pair);
      } else {
        sim = itemSimilarity(item, owner.a[item.id], other.a[item.id]);
      }
      if (sim === null) continue;
      answered++;
      const importance = weights[item.id];
      let mult = importance ? (IMPORTANCE_MULTIPLIER[importance] ?? 1) : 1;
      if (importance === 3 && violatesDealbreaker(acceptable[item.id], other.a[item.id])) {
        alerts.push(item.id);
        sim = 0;
        mult = IMPORTANCE_MULTIPLIER[3];
      }
      sum += sim * mult;
      mass += mult;
    }
    if (answered > 0) sections[section.id] = { score: sum / mass, answered };
  }
  return { sections, overall: weightedOverall(sections), alerts };
}

/** Pairwise scores between two payloads: symmetric display scores plus each
 * side's weighted directional fit. */
export function pairScores(pa: ProfilePayload, pb: ProfilePayload): PairScores {
  const sections: Record<string, SectionScore> = {};
  let coverage = 0;
  for (const section of SECTIONS) {
    if (section.privacy !== 'open') continue;
    let sum = 0;
    let n = 0;
    for (const item of section.items) {
      const sim = itemSimilarity(item, pa.a[item.id], pb.a[item.id]);
      if (sim !== null) {
        sum += sim;
        n++;
      }
    }
    if (n > 0) sections[section.id] = { score: sum / n, answered: n };
    coverage += n;
  }
  return {
    sections,
    overall: weightedOverall(sections),
    fitA: directionalFit(pa, pb),
    fitB: directionalFit(pb, pa),
    coverage,
  };
}

export interface GridRow {
  readonly item: Item;
  readonly answers: readonly (AnswerValue | null)[];
  readonly answeredCount: number;
  /** Group similarity (minimum over all pairs — the weakest link), or null. */
  readonly sim: number | null;
}

export interface GridSection {
  readonly section: Section;
  readonly rows: readonly GridRow[];
}

/** Grid data for a set of payloads: every open item with everyone's answers. */
export function buildGrid(payloads: readonly ProfilePayload[]): GridSection[] {
  return SECTIONS.filter((s) => s.privacy === 'open')
    .map((section) => ({
      section,
      rows: section.items.map((item): GridRow => {
        const answers = payloads.map((p) => {
          const v = p.a[item.id];
          return v === undefined || v === null ? null : v;
        });
        const answeredCount = answers.filter((v) => v !== null).length;
        let sim: number | null = null;
        if (payloads.length >= 2 && answeredCount === payloads.length) {
          sim = 1;
          for (let i = 0; i < payloads.length; i++) {
            for (let j = i + 1; j < payloads.length; j++) {
              const s = itemSimilarity(item, answers[i], answers[j]);
              if (s !== null) sim = Math.min(sim, s);
            }
          }
        }
        return { item, answers, answeredCount, sim };
      }),
    }))
    .filter((g) => g.rows.some((r) => r.answeredCount > 0));
}
