// Packs — the answering experience's chunking, laid OVER the schema.
// Sections stay the stable storage taxonomy (ids in payloads, privacy
// tiers); packs are pure presentation: small themed runs of questions,
// answered one card at a time. Every item belongs to exactly one pack
// (packs.spec.ts enforces the partition), so pack ids and groupings are
// free to change — nothing stored ever references them.
import type { Answers } from './types';

export interface Pack {
  readonly id: string;
  readonly title: string;
  readonly emoji: string;
  readonly blurb: string;
  readonly itemIds: readonly string[];
  /** When present, the pack is offered only if this returns true. */
  readonly condition?: (answers: Answers) => boolean;
}

/** Positive interest (1..3) on any non-monogamous connection type, or a
 * non-mono structure selected, unlocks the ENM depth pack. */
function leansOpen(answers: Answers): boolean {
  const NONMONO_INTERESTS = ['sk.poly', 'sk.open', 'sk.swing', 'sk.ra'];
  for (const id of NONMONO_INTERESTS) {
    const v = answers[id];
    if (typeof v === 'number' && v >= 1) return true;
  }
  // st.ideal option indexes 1..6 are the non-monogamy structures
  // (Monogamish … Swinging / play partners); 0/7/8 are not signals.
  const ideal = answers['st.ideal'];
  if (Array.isArray(ideal)) return ideal.some((i) => i >= 1 && i <= 6);
  return false;
}

export const PACKS: readonly Pack[] = [
  {
    id: 'hello',
    title: 'First feathers',
    emoji: '🥚',
    blurb: 'The short first pass — enough for a meaningful compare.',
    itemIds: [
      'ab.pn',
      'ab.age',
      'ab.gender',
      'ab.orient',
      'sk.friend',
      'sk.activity',
      'sk.casual',
      'sk.longterm',
      'sk.mono',
      'sk.poly',
      'sk.hookup',
    ],
  },
  {
    id: 'seeking-more',
    title: 'Every kind of connection',
    emoji: '🌈',
    blurb: 'The full landscape — chosen family, marriage, and everything between.',
    itemIds: [
      'sk.network',
      'sk.marriage',
      'sk.open',
      'sk.swing',
      'sk.ra',
      'sk.qpr',
      'sk.nesting',
      'sk.coparent',
      'sk.penpal',
    ],
  },
  {
    id: 'compass',
    title: 'Inner compass',
    emoji: '🧭',
    blurb: 'Ten sliders, no wrong answers — the middle counts too.',
    itemIds: [
      'va.together',
      'va.novelty',
      'va.heart',
      'va.spend',
      'va.express',
      'va.spirit',
      'va.ambition',
      'va.tradition',
      'va.social',
      'va.plan',
    ],
  },
  {
    id: 'rhythms',
    title: 'Everyday rhythms',
    emoji: '🍳',
    blurb: 'The day-to-day stuff that quietly makes or breaks it.',
    itemIds: [
      'ls.alcohol',
      'ls.smoke',
      'ls.cannabis',
      'ls.diet',
      'ls.exercise',
      'ls.kids',
      'ls.pets',
      'ls.sleep',
      'ls.tidy',
      'ls.setting',
      'ls.travel',
    ],
  },
  {
    id: 'scenes',
    title: 'Little scenes',
    emoji: '✨',
    blurb: 'Two quick vignettes — what a good Tuesday and a good weekend look like.',
    itemIds: ['ls.tuesday', 'ls.weekend'],
  },
  {
    id: 'care',
    title: 'Giving & receiving care',
    emoji: '💞',
    blurb: 'How you show care, how it lands, and the tempo that fits you.',
    itemIds: ['cn.give', 'cn.receive', 'cn.tempo', 'cn.alone', 'cn.social'],
  },
  {
    id: 'repair',
    title: 'Conflict & repair',
    emoji: '🧵',
    blurb: 'Everyone fights sometimes; the question is how you find your way back.',
    itemIds: ['cn.conflict', 'cn.repair', 'cn.direct', 'cn.close'],
  },
  {
    id: 'agreements',
    title: 'Structures & agreements',
    emoji: '🕸️',
    blurb: 'Everyone has a structure, even if it’s "just us two."',
    itemIds: ['st.ideal', 'st.meta', 'st.capacity', 'st.disclosure', 'st.safety'],
  },
  {
    id: 'open-hearts',
    title: 'Open hearts',
    emoji: '🫶',
    blurb: 'Depth questions for non-monogamous shapes — jealousy, compersion, autonomy.',
    itemIds: ['st.compersion', 'st.jealousy', 'st.autonomy'],
    condition: leansOpen,
  },
  {
    id: 'horizons',
    title: 'Plans & horizons',
    emoji: '🗺️',
    blurb: 'Where life might head — for anything long-term.',
    itemIds: ['pl.move', 'pl.money', 'pl.cohabit'],
  },
  {
    id: 'desires',
    title: 'Desires & play',
    emoji: '🎭',
    blurb: 'Optional, and only ever revealed mutually.',
    itemIds: [
      'dp.pda',
      'dp.cuddle',
      'dp.massage',
      'dp.talk',
      'dp.sext',
      'dp.dressup',
      'dp.roleplay',
      'dp.lightbond',
      'dp.rope',
      'dp.dom',
      'dp.sub',
      'dp.switch',
      'dp.impact',
      'dp.sensation',
      'dp.power',
      'dp.group',
      'dp.party',
      'dp.showoff',
      'dp.watch',
      'dp.toys',
      'dp.tantra',
      'dp.primal',
      'dp.praise',
      'dp.aftercare',
      'dp.vanilla',
    ],
  },
];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

/** Packs currently offered, given the answers so far. */
export function visiblePacks(answers: Answers): Pack[] {
  return PACKS.filter((p) => !p.condition || p.condition(answers));
}
