// The comparison, in sentences.
//
// Three jobs, one module. It is the non-visual equivalent of the meters, the
// strips and the matrix, which a screen reader cannot read at all. It is
// legible under stress, and people read compatibility results under stress.
// And it is the part someone will quote to the person they compared with,
// which no chart is.
//
// PHRASING RULES, which are the hard part here and not decoration:
//  - Describe differences, never grade them. "You differ most on X" — never
//    "you clash", "unfortunately", or "only 40%".
//  - Never render a verdict on the relationship. This module says what the
//    answers say; what to do about it is not its business.
//  - Attribute to people by creature name, not "you" and "them": a comparison
//    is often read side by side, and the second person has a name too.
//  - Say what is NOT covered. A number computed from nine shared answers
//    should not sound like a number computed from ninety.
import { answerChips, COMPLEMENT_PAIRS, itemLabel, type AnswerValue, type Item } from '@mng/core';
import type { CompareModel } from './compare-model';

export type NarrativeTone = 'plain' | 'attention';

export interface NarrativeNote {
  readonly tone: NarrativeTone;
  readonly text: string;
}

function answerText(item: Item, value: AnswerValue | null): string {
  if (value === null) return 'no answer';
  return answerChips(item, value)?.join(', ') ?? '—';
}

/**
 * "About me" is who someone IS — pronouns, gender, orientation, age. Those
 * belong in a profile and in the answer grid, and nowhere near a sentence
 * about where two people agree or differ: "you differ on Pronouns" is not a
 * compatibility finding, it is a category error, and for this audience an
 * insulting one. The narrative describes choices, not identities.
 */
const IDENTITY_SECTION = 'about';

/** Items both people answered, weakest agreement first. */
function sharedRows(model: CompareModel) {
  return model.grid
    .flatMap((section) => section.rows.map((row) => ({ row, section: section.section })))
    .filter((entry) => entry.row.sim !== null && entry.row.answeredCount === 2)
    .sort((a, b) => (a.row.sim ?? 0) - (b.row.sim ?? 0));
}

/**
 * Give/receive pairs are scored as an interlock precisely because matching is
 * the wrong frame for them — "we both give quality time" is not the same as
 * either person's needs being met, and scores.ts already excludes them from
 * plain similarity for that reason. Calling one a "difference" here would
 * contradict the interlock sentence a few lines further down.
 */
const INTERLOCKED_IDS = new Set(COMPLEMENT_PAIRS.flatMap((p) => [p.give, p.receive]));

/** The rows the agreement and difference sentences may draw on. */
function comparableRows(model: CompareModel) {
  return sharedRows(model).filter(
    (entry) => entry.section.id !== IDENTITY_SECTION && !INTERLOCKED_IDS.has(entry.row.item.id),
  );
}

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/**
 * How closely two answer sets sit, in words rather than a number. The bands
 * describe the answers, not the people: there is no "good" or "bad" score
 * here, and a low one is a description of a survey, not of a relationship.
 */
function overallPhrase(overall: number): string {
  if (overall >= 0.8) return 'your answers line up closely';
  if (overall >= 0.65) return 'your answers line up more often than not';
  if (overall >= 0.5) return 'you agree about as often as you differ';
  if (overall >= 0.35) return 'you differ more often than you agree';
  return 'you differ on most of what you both answered';
}

/**
 * Turn a computed comparison into plain sentences. Pair comparisons only —
 * with three or more profiles the honest sentence is a paragraph of caveats,
 * and the pairwise matrix already says it better.
 */
export function buildNarrative(model: CompareModel): NarrativeNote[] {
  const pair = model.pair;
  if (!pair || model.payloads.length !== 2) return [];
  const [nameA, nameB] = model.names;
  const notes: NarrativeNote[] = [];
  const shared = sharedRows(model);
  const comparable = comparableRows(model);

  if (pair.overall === null || shared.length === 0) {
    return [
      {
        tone: 'plain',
        text: `${nameA} and ${nameB} haven’t answered enough of the same questions yet for a comparison to mean much. Answering a few more of the same categories is what makes this page say something.`,
      },
    ];
  }

  notes.push({
    tone: 'plain',
    text: `Across the ${pair.coverage} questions ${nameA} and ${nameB} both answered, ${overallPhrase(pair.overall)}.`,
  });

  // Closest agreements: identical or near-identical answers, named.
  const closest = comparable.filter((entry) => (entry.row.sim ?? 0) >= 0.9).slice(-3);
  if (closest.length > 0) {
    notes.push({
      tone: 'plain',
      text: `You answered the same, or nearly the same, on ${list(closest.map((entry) => itemLabel(entry.row.item)))}.`,
    });
  }

  // Dealbreakers get their own, more informative sentence below, so an item
  // already flagged there must not also be listed as a plain difference —
  // saying it twice weakens both, and buries the one that matters.
  const alerted = new Set([...pair.fitA.alerts, ...pair.fitB.alerts]);

  // The widest gaps, with both answers spelled out so the sentence is
  // actionable rather than a verdict someone has to go and look up.
  const widest = comparable
    .filter((entry) => (entry.row.sim ?? 1) <= 0.4 && !alerted.has(entry.row.item.id))
    .slice(0, 2);
  for (const entry of widest) {
    const { item, answers } = entry.row;
    notes.push({
      tone: 'plain',
      text: `On ${itemLabel(item)}, ${nameA} said ${answerText(item, answers[0])} and ${nameB} said ${answerText(item, answers[1])}.`,
    });
  }

  // Dealbreakers: the one thing on this page that is genuinely urgent, and
  // the one place the copy says outright that it is not a verdict.
  const alerts: { holder: string; other: string; ids: readonly string[] }[] = [
    { holder: nameA, other: nameB, ids: pair.fitA.alerts },
    { holder: nameB, other: nameA, ids: pair.fitB.alerts },
  ];
  for (const alert of alerts) {
    if (alert.ids.length === 0) continue;
    const labels = alert.ids.map((id) => {
      const row = shared.find((entry) => entry.row.item.id === id);
      return row ? itemLabel(row.row.item) : id;
    });
    notes.push({
      tone: 'attention',
      text: `${alert.holder} marked ${list(labels)} a dealbreaker, and ${alert.other}’s answer falls outside what ${alert.holder} said they could live with. That’s a conversation to have, not a score to fix.`,
    });
  }

  // Directional fit is the most misread number on the page: two people can
  // see different percentages from the same answers, and that is the point.
  if (pair.fitA.overall !== null && pair.fitB.overall !== null) {
    notes.push({
      tone: 'plain',
      text: `Fit is scored twice, because you weigh things differently: ${pct(pair.fitA.overall)} for ${nameA}, weighted by what ${nameA} marked as mattering, and ${pct(pair.fitB.overall)} for ${nameB}.`,
    });
  }

  // Care is scored as an interlock, not a similarity — worth saying, because
  // "we both give quality time" is not the same as either need being met.
  for (const row of model.interlocks) {
    if (row.forA === null || row.forB === null) continue;
    if (Math.abs(row.forA - row.forB) < 0.34) continue;
    const [more, less] =
      row.forA > row.forB
        ? [
            { receiver: nameA, giver: nameB, score: row.forA },
            { receiver: nameB, giver: nameA, score: row.forB },
          ]
        : [
            { receiver: nameB, giver: nameA, score: row.forB },
            { receiver: nameA, giver: nameB, score: row.forA },
          ];
    notes.push({
      tone: 'plain',
      text: `${more.giver} already gives most of what ${more.receiver} says lands best (${pct(more.score)}), while ${less.giver} covers ${pct(less.score)} of what ${less.receiver} needs. That’s a difference in kind, not effort.`,
    });
  }

  if (model.desireRows.length > 0) {
    const n = model.desireRows.length;
    notes.push({
      tone: 'plain',
      text: `${n} desire${n === 1 ? '' : 's'} came back mutual — shown only because you both said yes. Anything either of you answered alone stayed hidden, from both of you.`,
    });
  }

  notes.push({
    tone: 'plain',
    text: `All of this describes the ${pair.coverage} questions you both answered. Anything either of you skipped isn’t counted here, in any direction.`,
  });

  return notes;
}
