import type { AnswerValue, Item, ProfilePayload, Section } from '../schema/types';
import { SECTIONS } from '../schema/sections';
import { itemSimilarity } from './similarity';

export const SECTION_WEIGHTS: Readonly<Record<string, number>> = {
  seeking: 0.25,
  values: 0.3,
  lifestyle: 0.2,
  connection: 0.15,
  structure: 0.1,
};

export function displayName(payload: ProfilePayload, fallback: string): string {
  const n = payload.a['ab.name'];
  return typeof n === 'string' && n.trim() ? n.trim() : fallback;
}

export interface SectionScore {
  readonly score: number;
  readonly answered: number;
}

export interface PairScores {
  readonly sections: Record<string, SectionScore>;
  readonly overall: number | null;
}

/** Pairwise scores between two payloads: per-section and weighted overall. */
export function pairScores(pa: ProfilePayload, pb: ProfilePayload): PairScores {
  const sections: Record<string, SectionScore> = {};
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
  }
  let wsum = 0;
  let w = 0;
  for (const [id, weight] of Object.entries(SECTION_WEIGHTS)) {
    const s = sections[id];
    if (s) {
      wsum += s.score * weight;
      w += weight;
    }
  }
  return { sections, overall: w > 0 ? wsum / w : null };
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
          return v === undefined || v === null || v === '' ? null : v;
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
