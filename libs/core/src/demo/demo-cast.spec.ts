import { describe, expect, it } from 'vitest';
import { buildDemoCast } from './demo-cast';
import { allItems } from '../schema/schema';
import { pairScores } from '../match/scores';
import { revealMutualDesires } from '../match/reveal';
import { personaFromViewPhrase } from '../persona/persona';

/**
 * A demo that rots is worse than none: it would show a newcomer a broken or
 * dishonest version of the thing being sold. These tests fail the moment the
 * schema moves under the cast, rather than letting it quietly degrade.
 */
describe('the demo cast', () => {
  it('answers only ids the schema actually has', async () => {
    const known = new Set(allItems().map(({ item }) => item.id));
    const cast = await buildDemoCast();
    for (const profile of cast) {
      for (const id of Object.keys(profile.payload.a)) {
        expect(known, `${profile.phrase} answers unknown item ${id}`).toContain(id);
      }
    }
  });

  it('carries phrases that mint real creatures', async () => {
    for (const profile of await buildDemoCast()) {
      const persona = await personaFromViewPhrase(profile.phrase);
      expect(persona, `${profile.phrase} is not a valid view phrase`).not.toBeNull();
      expect(profile.phrase.split('-')).toHaveLength(6);
    }
  });

  it('compares as a strong but imperfect fit', async () => {
    const [otter, owl] = await buildDemoCast();
    const scores = pairScores(otter.payload, owl.payload);
    // Two people who genuinely get on: high enough to be worth the survey,
    // short of a suspicious 1.0.
    expect(scores.overall).toBeGreaterThan(0.6);
    expect(scores.overall).toBeLessThan(0.95);
    expect(scores.coverage).toBeGreaterThan(10);
  });

  it('trips exactly one dealbreaker, in one direction', async () => {
    const [otter, owl] = await buildDemoCast();
    const scores = pairScores(otter.payload, owl.payload);
    // The otter drinks never and accepts rarely; the owl drinks socially.
    expect(scores.fitA.alerts).toEqual(['ls.alcohol']);
    // The owl set no dealbreakers, so nothing fires the other way — the
    // demo shows a directional alert, not a symmetric verdict.
    expect(scores.fitB.alerts).toEqual([]);
  });

  it('reveals only the desires both of them marked', async () => {
    const cast = await buildDemoCast();
    const revealed = (await revealMutualDesires(cast.map((p) => p.payload))).map((r) => r.item.id);
    expect(revealed).toContain('dp.cuddle');
    expect(revealed).toContain('dp.talk');
    // One-sided answers must stay invisible, or the demo would be teaching
    // the wrong thing about how desires travel.
    expect(revealed).not.toContain('dp.massage');
    expect(revealed).not.toContain('dp.dressup');
    expect(revealed).not.toContain('dp.aftercare');
  });

  it('never puts a desire answer in the open payload', async () => {
    for (const { payload } of await buildDemoCast()) {
      expect(Object.keys(payload.a).some((id) => id.startsWith('dp.'))).toBe(false);
      expect(payload.m?.length).toBeGreaterThan(0);
    }
  });
});
