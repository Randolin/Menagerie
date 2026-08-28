import { buildDemoCast, personaFromViewPhrase } from '@moxy/core';
import { buildCompareModel, type CompareSlot } from './compare-model';
import { buildNarrative } from './narrative';

/**
 * Tested against the demo cast rather than hand-built fixtures: those two are
 * already maintained to stay valid against the schema, and a narrative tested
 * on invented scores would drift from what the panel actually renders.
 */
async function demoModel() {
  const cast = await buildDemoCast();
  const slots: CompareSlot[] = await Promise.all(
    cast.map(async (profile) => ({
      ref: profile.phrase,
      payload: profile.payload,
      persona: await personaFromViewPhrase(profile.phrase),
    })),
  );
  return buildCompareModel(slots);
}

describe('the compare narrative', () => {
  it('opens by saying what it is describing, and how much of it', async () => {
    const notes = buildNarrative(await demoModel());
    expect(notes.length).toBeGreaterThan(3);
    expect(notes[0].text).toMatch(/questions/);
    expect(notes[0].text).toMatch(/brave-azure-otter/);
    expect(notes[0].text).toMatch(/calm-bright-owl/);
  });

  it('names the dealbreaker and marks it for attention', async () => {
    const notes = buildNarrative(await demoModel());
    const alert = notes.find((n) => n.tone === 'attention');
    expect(alert?.text).toContain('Alcohol');
    expect(alert?.text).toContain('dealbreaker');
    // The one place the copy says outright that this is not a verdict.
    expect(alert?.text).toContain('conversation');
  });

  it('explains why fit is two numbers rather than one', async () => {
    const notes = buildNarrative(await demoModel());
    const fit = notes.find((n) => n.text.includes('scored twice'));
    expect(fit?.text).toMatch(/\d+%/);
    expect(fit?.text).toContain('brave-azure-otter');
  });

  it('describes the care interlock as a difference in kind', async () => {
    const notes = buildNarrative(await demoModel());
    // The demo pair is deliberately asymmetric here: one covers all of the
    // other's needs, the other covers half.
    const care = notes.find((n) => n.text.includes('lands best'));
    expect(care?.text).toContain('not effort');
  });

  it('counts mutual desires without naming the one-sided ones', async () => {
    const notes = buildNarrative(await demoModel());
    const desires = notes.find((n) => n.text.includes('mutual'));
    expect(desires?.text).toMatch(/2 desires/);
    expect(notes.some((n) => n.text.includes('Sensual massage'))).toBe(false);
  });

  it('ends by naming what it did not count', async () => {
    const notes = buildNarrative(await demoModel());
    expect(notes[notes.length - 1].text).toMatch(/skipped/);
  });

  // The phrasing rules are the feature. A sentence that grades the pair, or
  // reads as a verdict on the relationship, is a defect here — not a nit.
  it('never grades the people or the relationship', async () => {
    const notes = buildNarrative(await demoModel());
    const text = notes.map((n) => n.text).join(' ');
    for (const forbidden of [
      'unfortunately',
      'sadly',
      'poor match',
      'bad match',
      'great match',
      'perfect match',
      'incompatible',
      'compatible',
      'you should',
      'you shouldn’t',
      'clash',
      'fail',
    ]) {
      expect(text.toLowerCase(), `narrative says "${forbidden}"`).not.toContain(forbidden);
    }
    // Minimisers, which is what "only"/"just" do to a number — but not the
    // ordinary senses of those words ("shown only because you both said yes"
    // is precise, and banning it outright would make the copy worse).
    for (const minimiser of [/\bonly \d/i, /\bjust \d/i, /\bmerely\b/i]) {
      expect(text, `narrative minimises a number: ${minimiser}`).not.toMatch(minimiser);
    }
  });

  // Who someone is belongs in the profile and the answer grid, never in a
  // sentence about where two people "differ".
  it('never frames identity as agreement or difference', async () => {
    const text = buildNarrative(await demoModel())
      .map((n) => n.text)
      .join(' ');
    for (const identity of ['Pronouns', 'Gender', 'Orientation', 'Age range']) {
      expect(text, `narrative treats ${identity} as a comparison`).not.toContain(identity);
    }
  });

  // Care is scored as an interlock, so calling it a "difference" would
  // contradict the sentence that explains it two paragraphs later.
  it('describes care only as an interlock, never as a difference', async () => {
    const notes = buildNarrative(await demoModel());
    const asDifference = notes.filter(
      (n) => n.text.startsWith('On How care') || n.text.startsWith('On How I naturally show care'),
    );
    expect(asDifference).toEqual([]);
  });

  // The dealbreaker sentence says strictly more than a plain difference
  // sentence about the same item; saying both buries the one that matters.
  it('does not list a dealbreaker item as a plain difference too', async () => {
    const notes = buildNarrative(await demoModel());
    expect(notes.filter((n) => n.text.includes('Alcohol'))).toHaveLength(1);
  });

  it('says nothing rather than something misleading with one profile', async () => {
    const model = await demoModel();
    const single = await buildCompareModel([model.slots[0]]);
    expect(buildNarrative(single)).toEqual([]);
  });

  it('asks for more answers instead of scoring an empty overlap', async () => {
    const model = await demoModel();
    const empty: CompareSlot = {
      ref: 'empty',
      payload: { v: 2, a: {} },
      persona: model.slots[1].persona,
    };
    const notes = buildNarrative(await buildCompareModel([model.slots[0], empty]));
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/haven’t answered enough/);
  });
});
