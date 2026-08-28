// Two fictional creatures, so the payoff can be seen before it is paid for.
//
// Everything else in Menagerie needs two finished profiles and a server
// before it will show you anything. That is a hard sell to someone deciding
// whether twenty minutes of survey is worth it, so this pair exists purely to
// be compared: real schema ids, real scoring, no network.
//
// The answers are hand-written rather than generated (the QA cast in `qa/` is
// generated, and reads like it — twins and exact inversions prove score
// bounds, they do not look like two people). These two are written to land
// three specific moments: a strong overall fit, one dealbreaker that needs a
// conversation, and a mutual desire neither of them could have seen alone.
import { buildSharePayload } from '../codec/codec';
import { buildMatchTokens } from '../crypto/match-tokens';
import type { Acceptable, Answers, ProfilePayload, Weights } from '../schema/types';

export interface DemoProfile {
  /** A real, well-formed view phrase — the persona and its art derive from it. */
  readonly phrase: string;
  readonly payload: ProfilePayload;
}

interface DemoSource {
  readonly phrase: string;
  /** Fixed, because nothing here is secret — these profiles are fiction. */
  readonly salt: string;
  readonly answers: Answers;
  readonly weights: Weights;
  readonly acceptable: Acceptable;
}

const SOURCES: readonly DemoSource[] = [
  {
    // Warm, plans ahead, sober by choice — and says so as a dealbreaker.
    phrase: 'brave-azure-otter-mistwoven-emberlit-fernhollow',
    salt: 'demo-otter',
    answers: {
      'ab.pn': [2],
      'ab.age': 1,
      'sk.friend': 3,
      'sk.activity': 3,
      'sk.longterm': 3,
      'sk.poly': 2,
      'sk.qpr': 2,
      'sk.casual': 1,
      'sk.mono': 0,
      'sk.hookup': 0,
      'va.together': 4,
      'va.novelty': 4,
      'va.heart': 3,
      'va.express': 5,
      'va.social': 2,
      'va.plan': 4,
      'ls.alcohol': 0,
      'ls.smoke': 0,
      'ls.exercise': 2,
      'ls.sleep': 0,
      // Gives time and touch; needs words and time. The mismatch with the
      // owl below is the whole point of scoring care as an interlock.
      'cn.give': [1, 2],
      'cn.receive': [0, 1],
      'dp.cuddle': 3,
      'dp.talk': 3,
      'dp.massage': 2,
      'dp.aftercare': 3,
      'dp.rope': 0,
    },
    weights: { 'ls.alcohol': 3, 'va.together': 2, 'sk.longterm': 2 },
    // Never or rarely. The owl drinks socially, which is the alert.
    acceptable: { 'ls.alcohol': [0, 1] },
  },
  {
    // Curious, spontaneous, drinks socially. Matches on almost everything
    // that is not the one thing the otter marked a dealbreaker.
    phrase: 'calm-bright-owl-moonlit-honeywarmed-willowbrook',
    salt: 'demo-owl',
    answers: {
      'ab.pn': [0],
      'ab.age': 1,
      'sk.friend': 3,
      'sk.activity': 2,
      'sk.longterm': 2,
      'sk.poly': 3,
      'sk.qpr': 1,
      'sk.casual': 1,
      'sk.mono': 0,
      'sk.hookup': 1,
      'va.together': 3,
      'va.novelty': 5,
      'va.heart': 4,
      'va.express': 4,
      'va.social': 3,
      'va.plan': 2,
      'ls.alcohol': 2,
      'ls.smoke': 0,
      'ls.exercise': 3,
      'ls.sleep': 1,
      'cn.give': [0, 1],
      'cn.receive': [2, 3],
      // Cuddling and long talks are mutual; the massage is not, and the
      // dress-up the otter never answered stays invisible either way.
      'dp.cuddle': 3,
      'dp.talk': 2,
      'dp.massage': 0,
      'dp.dressup': 2,
    },
    weights: { 'va.novelty': 2, 'sk.poly': 2 },
    acceptable: {},
  },
];

/**
 * Build the demo pair. Async only because desire fingerprints are hashed the
 * same way real ones are — this touches no network and needs no server, which
 * is what lets the demo be the one page that still works when the profile
 * server is unreachable.
 */
export async function buildDemoCast(): Promise<readonly DemoProfile[]> {
  return Promise.all(
    SOURCES.map(async (source) => ({
      phrase: source.phrase,
      payload: buildSharePayload(
        source.answers,
        await buildMatchTokens(source.answers, source.salt),
        source.salt,
        source.weights,
        source.acceptable,
      ),
    })),
  );
}
