import { describe, expect, it } from 'vitest';
import {
  describePhrase,
  diagnoseEditPhrase,
  diagnoseViewPhrase,
  extractEditPhrase,
} from './phrase-check';
import { mintEditPhrase, mintViewPhrase } from './phrases';

const GOOD_VIEW = 'brave-azure-otter-mistwoven-emberlit-fernhollow';

describe('diagnoseViewPhrase', () => {
  it('passes a real phrase, however it was typed', () => {
    for (const form of [
      GOOD_VIEW,
      GOOD_VIEW.replace(/-/g, ' '),
      `  ${GOOD_VIEW.toUpperCase()}  `,
      'brave azure-otter mistwoven  emberlit-fernhollow',
    ]) {
      expect(diagnoseViewPhrase(form).ok, form).toBe(true);
    }
  });

  it('passes freshly minted phrases', async () => {
    for (let i = 0; i < 5; i++) {
      expect(diagnoseViewPhrase(await mintViewPhrase()).ok).toBe(true);
    }
  });

  it('names the mistyped word and offers the correction', () => {
    // One letter dropped from "otter".
    const found = diagnoseViewPhrase('brave-azure-oter-mistwoven-emberlit-fernhollow');
    expect(found.ok).toBe(false);
    expect(found.problems).toHaveLength(1);
    expect(found.problems[0]).toMatchObject({ index: 2, word: 'oter', suggestion: 'otter' });
  });

  it('knows which slot a word belongs to', () => {
    // Both are real words, but swapped into each other's positions.
    const found = diagnoseViewPhrase('otter-azure-brave-mistwoven-emberlit-fernhollow');
    expect(found.problems.map((p) => p.index)).toEqual([0, 2]);
  });

  it('offers no suggestion when the correction is ambiguous', () => {
    // Not one edit from anything: a suggestion here would be invention.
    const found = diagnoseViewPhrase('brave-azure-zzzzzzzz-mistwoven-emberlit-fernhollow');
    expect(found.problems[0].suggestion).toBeNull();
  });

  it('diagnoses a phrase pasted as a link', () => {
    const ok = diagnoseViewPhrase(`https://menagerie.love/#/view/${GOOD_VIEW}`);
    expect(ok.ok).toBe(true);
    const typo = diagnoseViewPhrase(
      'https://menagerie.love/#/view/brave-azure-oter-mistwoven-emberlit-fernhollow',
    );
    expect(typo.problems[0].suggestion).toBe('otter');
  });

  it('reports a wrong word count without hiding the bad words', () => {
    const found = diagnoseViewPhrase('brave-azure-oter');
    expect(found.ok).toBe(false);
    expect(found.actualWords).toBe(3);
    expect(found.expectedWords).toBe(6);
    // The typo is still named — fixing the length should not reveal a second
    // round of complaints one at a time.
    expect(found.problems[0].suggestion).toBe('otter');
  });
});

describe('diagnoseEditPhrase', () => {
  it('passes freshly minted phrases', async () => {
    for (let i = 0; i < 3; i++) {
      const diagnosis = await diagnoseEditPhrase(await mintEditPhrase());
      expect(diagnosis.ok).toBe(true);
    }
  });

  it('catches a word that is not in the EFF list', async () => {
    const phrase = await mintEditPhrase();
    const words = phrase.split(' ');
    const found = await diagnoseEditPhrase(['zzzzzzzzz', ...words.slice(1)].join(' '));
    expect(found.ok).toBe(false);
    expect(found.problems[0].index).toBe(0);
  });

  it('counts words', async () => {
    const found = await diagnoseEditPhrase('one two three');
    expect(found.actualWords).toBe(3);
    expect(found.expectedWords).toBe(5);
  });
});

describe('describePhrase', () => {
  it('says nothing when nothing is wrong', () => {
    expect(describePhrase(diagnoseViewPhrase(GOOD_VIEW), 'view phrase')).toBeNull();
  });

  it('leads with the correction when there is one', () => {
    const message = describePhrase(
      diagnoseViewPhrase('brave-azure-oter-mistwoven-emberlit-fernhollow'),
      'view phrase',
    );
    expect(message).toContain('oter');
    expect(message).toContain('otter');
    expect(message).toContain('word 3');
  });

  it('explains a length mismatch in words a person can act on', () => {
    const message = describePhrase(diagnoseViewPhrase(GOOD_VIEW + '-extra'), 'view phrase');
    expect(message).toContain('6 words');
    expect(message).toContain('extra word');
  });
});

/**
 * The view box takes a string somebody else sent. That makes its error
 * message a security surface, not just a usability one: whoever pasted an
 * edit phrase in there is already holding it, and telling them what they hold
 * converts an accident into an informed opportunity. A savvy reader can work
 * it out from the word count anyway — so the disclosure only ever reaches the
 * person who had not worked it out, which is exactly the wrong audience.
 *
 * These pin the silence rather than the words.
 */
describe('the view box says nothing about what it was given', () => {
  const NEUTRAL = 'Ask whoever shared it for their six-word view phrase.';

  it('answers an edit phrase with the same line as any other wrong shape', async () => {
    const editPhrase = await mintEditPhrase();
    for (const input of [editPhrase, 'hello world', 'one two three four five six seven', '']) {
      expect(describePhrase(diagnoseViewPhrase(input), 'view phrase', NEUTRAL)).toBe(NEUTRAL);
    }
  });

  it('never names what the string actually was', async () => {
    const said = describePhrase(
      diagnoseViewPhrase(await mintEditPhrase()),
      'view phrase',
      NEUTRAL,
    )!;
    for (const leak of ['edit', 'private', 'secret', 'control', 'delete', 'five', 'password']) {
      expect(said.toLowerCase(), leak).not.toContain(leak);
    }
  });

  it('still corrects a typo in something that IS the right shape', () => {
    // A dropped letter, not a transposition: swapping two letters is two
    // substitutions, and suggestFrom deliberately stops at one edit.
    const typo = GOOD_VIEW.replace('otter', 'oter');
    const said = describePhrase(diagnoseViewPhrase(typo), 'view phrase', 'neutral')!;
    expect(said).toContain('oter');
    expect(said).toContain('otter');
  });

  it('does not enumerate which words are in the lists when the shape is wrong', () => {
    // Word-level detail on a wrong-shaped string is unusable to the reader and
    // teaches the system's grammar to whoever pasted it.
    const said = describePhrase(diagnoseViewPhrase('correct horse battery'), 'view phrase')!;
    expect(said).not.toContain('correct');
    expect(said).toContain('3');
  });
});

describe('extractEditPhrase', () => {
  it('takes the phrase back off the clipboard warning it was copied with', async () => {
    const phrase = await mintEditPhrase();
    const pasted = `⚠️ Menagerie EDIT phrase — never share this. Anyone who has it can change or delete your profile.\n${phrase}`;
    expect(await extractEditPhrase(pasted)).toBe(phrase);
    // A single-line input flattens the newline, which is the case that matters.
    expect(await extractEditPhrase(pasted.replace('\n', ' '))).toBe(phrase);
  });

  it('passes a bare phrase through, however it was typed', async () => {
    const phrase = await mintEditPhrase();
    expect(await extractEditPhrase(phrase)).toBe(phrase);
    expect(await extractEditPhrase(`  ${phrase.replace(/ /g, '-').toUpperCase()}  `)).toBe(phrase);
  });

  it('refuses to silently discard words from an over-long phrase', async () => {
    // Someone who typed seven words of their own phrase must get the ordinary
    // "an edit phrase is five words" message, not two words quietly dropped.
    expect(await extractEditPhrase('brave azure otter mistwoven emberlit fernhollow extra')).toBe(
      null,
    );
    expect(await extractEditPhrase('one two three four')).toBe(null);
  });
});
