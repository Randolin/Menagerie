// Telling someone their phrase is wrong, instantly, and where.
//
// Both phrases are drawn from fixed public wordlists, so a phrase containing
// a word that is not in them cannot possibly be right — and checking that
// costs microseconds while the Argon2id derivation it would otherwise reach
// costs seconds. Before this, a single mistyped letter bought a multi-second
// wait and "no profile answers to that phrase", which is indistinguishable
// from a profile that was deleted.
//
// Nothing here is a secrecy trade: these lists ship in the bundle already,
// and a view phrase's grammar is documented in-app. Guessing the phrase still
// costs what it always did.
import { normalizePassphrase } from '../crypto/phrase-kdf';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from '../persona/wordlists';
import { TAIL_ADJECTIVES, TAIL_PLACES } from '../persona/tail-wordlists';
import { EDIT_PHRASE_WORDS, VIEW_PHRASE_WORDS } from './phrases';

/** One word that is not in the list its position requires. */
export interface WordProblem {
  /** 0-based position in the phrase. */
  readonly index: number;
  readonly word: string;
  /** What the list holds one edit away, when exactly that is unambiguous. */
  readonly suggestion: string | null;
  /** What this position must hold, for a message that can name it. */
  readonly expects: string;
}

export interface PhraseDiagnosis {
  readonly ok: boolean;
  readonly expectedWords: number;
  readonly actualWords: number;
  readonly problems: readonly WordProblem[];
}

/**
 * True when one insertion, deletion, or substitution turns `a` into `b`.
 * Deliberately not a full edit distance: a two-edit "suggestion" is wrong
 * often enough to be worse than none, and this runs over a 7,776-word list.
 */
function isOneEditApart(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
}

/** The single one-edit neighbour, or null when there are none or several. */
function suggestFrom(list: readonly string[], word: string): string | null {
  let found: string | null = null;
  for (const candidate of list) {
    if (!isOneEditApart(word, candidate)) continue;
    // Two plausible corrections is not a suggestion, it is a guess.
    if (found) return null;
    found = candidate;
  }
  return found;
}

const ANIMAL_NAMES: readonly string[] = ANIMALS.map((a) => a.name);

/** What each slot of a view phrase must hold, in order. */
const VIEW_SLOTS: readonly { readonly list: readonly string[]; readonly expects: string }[] = [
  { list: ADJECTIVES_A, expects: 'an adjective' },
  { list: ADJECTIVES_B, expects: 'an adjective' },
  { list: ANIMAL_NAMES, expects: 'an animal' },
  { list: TAIL_ADJECTIVES, expects: 'a tail word' },
  { list: TAIL_ADJECTIVES, expects: 'a tail word' },
  { list: TAIL_PLACES, expects: 'a place' },
];

/**
 * Pull the phrase out of a pasted link, so a typo inside a URL is diagnosed
 * as a typo rather than as six words of nonsense. Mirrors what the extractor
 * accepts — a diagnostic that rejects inputs the real parser takes would send
 * people chasing the wrong problem.
 */
function phraseCandidate(text: string): string {
  const url = text.trim().match(/#\/(?:view|group)\/([A-Za-z-]+)/);
  return url ? url[1] : text;
}

function diagnose(
  text: string,
  expectedWords: number,
  listAt: (index: number) => { list: readonly string[]; expects: string },
): PhraseDiagnosis {
  const words = normalizePassphrase(phraseCandidate(text)).split(' ').filter(Boolean);
  const problems: WordProblem[] = [];
  // Check the words that exist even when the count is wrong: a phrase that is
  // both short and misspelled should say both, not make the person fix the
  // count and come back to be told again.
  for (let i = 0; i < Math.min(words.length, expectedWords); i++) {
    const { list, expects } = listAt(i);
    if (list.includes(words[i])) continue;
    problems.push({ index: i, word: words[i], suggestion: suggestFrom(list, words[i]), expects });
  }
  return {
    ok: words.length === expectedWords && problems.length === 0,
    expectedWords,
    actualWords: words.length,
    problems,
  };
}

/** Instant check of a view phrase against the public grammar. */
export function diagnoseViewPhrase(text: string): PhraseDiagnosis {
  return diagnose(text, VIEW_PHRASE_WORDS, (i) => VIEW_SLOTS[i]);
}

/**
 * Instant check of an edit phrase against the EFF list. Async because that
 * list is a lazily-imported ~78 KB chunk and must stay one — call this when a
 * phrase is submitted, not on every keystroke of a page that may never see
 * one.
 */
export async function diagnoseEditPhrase(text: string): Promise<PhraseDiagnosis> {
  const { WORDS } = await import('../crypto/eff-wordlist');
  return diagnose(text, EDIT_PHRASE_WORDS, () => ({ list: WORDS, expects: 'a word' }));
}

/**
 * The diagnosis as one sentence for a person: what is wrong, where, and the
 * correction when there is an unambiguous one. Null when nothing is wrong.
 */
export function describePhrase(diagnosis: PhraseDiagnosis, label: string): string | null {
  if (diagnosis.ok) return null;
  const { problems, expectedWords, actualWords } = diagnosis;
  const first = problems[0];
  if (first) {
    const where = `word ${first.index + 1}`;
    const fix = first.suggestion ? ` Did you mean “${first.suggestion}”?` : '';
    return `“${first.word}” isn’t ${first.expects} Menagerie uses (${where}).${fix}`;
  }
  const short = actualWords < expectedWords;
  return (
    `A ${label} is ${expectedWords} words — that’s ${actualWords}. ` +
    (short ? 'Something may be missing.' : 'There may be an extra word.')
  );
}
