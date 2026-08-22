// Comparison engine: turns 2+ decoded payloads into structured overlap data
// for the charts, plus pairwise compatibility scores.

import { SECTIONS, INTEREST_LEVELS } from './schema.js';
import { probeLevel } from './crypto.js';

export const SECTION_WEIGHTS = {
  seeking: 0.25,
  values: 0.30,
  lifestyle: 0.20,
  connection: 0.15,
  structure: 0.10,
};

export function displayName(payload, fallback) {
  const n = payload.a['ab.name'];
  return (typeof n === 'string' && n.trim()) ? n.trim() : fallback;
}

// Per-item similarity in [0,1], or null when not comparable (unanswered or text).
export function itemSimilarity(item, a, b) {
  if (a === undefined || b === undefined || a === null || b === null) return null;
  switch (item.type) {
    case 'scale':
      return 1 - Math.abs(a - b) / 6;
    case 'interest':
      // Agreement, not mutual enthusiasm: two people who both answered
      // "not for me" agree perfectly. Mutual-interest highlighting is a
      // display concern, handled by the seeking matrix.
      return 1 - Math.abs(a - b) / 3;
    case 'choice': {
      if (a === b) return 1;
      if (item.ordinal && item.options.length > 1) {
        return 1 - Math.abs(a - b) / (item.options.length - 1);
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
    default:
      return null; // text
  }
}

// Pairwise scores between two payloads: per-section and weighted overall.
export function pairScores(pa, pb) {
  const sections = {};
  for (const section of SECTIONS) {
    if (section.privacy !== 'open') continue;
    let sum = 0, n = 0;
    for (const item of section.items) {
      const sim = itemSimilarity(item, pa.a[item.id], pb.a[item.id]);
      if (sim !== null) { sum += sim; n++; }
    }
    if (n > 0) sections[section.id] = { score: sum / n, answered: n };
  }
  let wsum = 0, w = 0;
  for (const [id, weight] of Object.entries(SECTION_WEIGHTS)) {
    if (sections[id]) { wsum += sections[id].score * weight; w += weight; }
  }
  return { sections, overall: w > 0 ? wsum / w : null };
}

// Grid data for a set of payloads: every open item with everyone's answers.
export function buildGrid(payloads) {
  return SECTIONS
    .filter((s) => s.privacy === 'open')
    .map((section) => ({
      section,
      rows: section.items.map((item) => {
        const answers = payloads.map((p) => {
          const v = p.a[item.id];
          return v === undefined || v === null || v === '' ? null : v;
        });
        const answeredCount = answers.filter((v) => v !== null).length;
        let sim = null;
        if (payloads.length >= 2 && answeredCount === payloads.length) {
          // Group similarity: minimum over all pairs (the weakest link).
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

// Mutual-reveal for the desires section. For each match-only item, probe each
// payload's token set; reveal only the items where at least two people are at
// level >= 1. Returns rows { item, levels[] } with 0 for "no discoverable
// positive" — levels of non-mutual items are withheld entirely.
export async function revealMutualDesires(payloads) {
  const rows = [];
  const desires = SECTIONS.find((s) => s.id === 'desires');
  for (const item of desires.items) {
    const levels = [];
    for (const p of payloads) levels.push(await probeLevel(p, item.id));
    const positive = levels.filter((l) => l >= 1).length;
    if (positive >= 2) rows.push({ item, levels });
  }
  // Warmest mutual matches first.
  rows.sort((x, y) => {
    const mx = Math.min(...x.levels.filter((l) => l >= 1));
    const my = Math.min(...y.levels.filter((l) => l >= 1));
    return my - mx;
  });
  return rows;
}

export function hasDesiresTokens(payload) {
  return Boolean(payload.m && payload.m.length && payload.s);
}

export function interestLevelLabel(level) {
  return INTEREST_LEVELS[level]?.label ?? String(level);
}
