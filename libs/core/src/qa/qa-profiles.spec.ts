// The manifest is typed data that a script feeds to a live server, so the
// only thing standing between a mistyped phrase and a confusing "profile not
// found" at seed time is this file.
import { describe, expect, it } from 'vitest';
import {
  QA_BOOPS,
  QA_GROUPS,
  QA_PROFILES,
  assertQaManifest,
  isQaGroupPhrase,
  isQaViewPhrase,
  qaProfile,
} from './qa-profiles';
import { qaAnswerSet } from './qa-answers';
import { EDIT_PHRASE_WORDS, isViewPhraseShaped } from '../hatch/phrases';
import { WORDS } from '../crypto/eff-wordlist';
import { GROUP_MAX_MEMBERS } from '../group/group-api';
import { BOOP_INTENTS } from '../boop/boop-data';
import { allItems, coreItems, getItem } from '../schema/schema';
import { SCALE_MAX } from '../schema/types';
import { buildSharePayload } from '../codec/codec';

describe('QA manifest', () => {
  it('is internally consistent', () => {
    expect(() => assertQaManifest()).not.toThrow();
  });

  it('holds well-formed, distinct phrases', () => {
    const phrases = [
      ...QA_PROFILES.map((p) => p.viewPhrase),
      ...QA_GROUPS.map((g) => g.groupPhrase),
    ];
    for (const phrase of phrases) expect(isViewPhraseShaped(phrase)).toBe(true);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  // The one rule that matters more than the rest: an edit phrase in this file
  // would be a live write credential published to everyone who can read the
  // repo. Edit phrases are 5 EFF words, so any run of five wordlist words in
  // a note, an id, or anywhere else is the mistake this guards against.
  it('carries no credential that is not a read capability', () => {
    const eff = new Set(WORDS);
    const source = JSON.stringify([QA_PROFILES, QA_GROUPS, QA_BOOPS]).toLowerCase();
    for (const run of source.match(/[a-z]+(?:[ -][a-z]+)+/g) ?? []) {
      const words = run.split(/[ -]/);
      let streak = 0;
      for (const word of words) {
        streak = eff.has(word) ? streak + 1 : 0;
        expect(streak, run).toBeLessThan(EDIT_PHRASE_WORDS);
      }
    }
  });

  it('resolves a phrase in any spacing or case', () => {
    const spec = QA_PROFILES[0];
    expect(qaProfile(spec.viewPhrase)?.id).toBe(spec.id);
    expect(qaProfile(spec.viewPhrase.replace(/-/g, ' ').toUpperCase())?.id).toBe(spec.id);
    expect(isQaViewPhrase(spec.viewPhrase)).toBe(true);
    expect(isQaViewPhrase('brave-amber-otter-mistwoven-emberlit-fernhollow')).toBe(false);
    expect(isQaViewPhrase(null)).toBe(false);
    expect(isQaGroupPhrase(QA_GROUPS[0].groupPhrase)).toBe(true);
    expect(isQaGroupPhrase(spec.viewPhrase)).toBe(false);
  });

  it('keeps every roster within the server cap', () => {
    for (const group of QA_GROUPS) {
      expect(group.members.length + group.fill).toBeLessThanOrEqual(GROUP_MAX_MEMBERS);
    }
  });

  it('names only real boop intents', () => {
    for (const boop of QA_BOOPS) {
      for (const intent of boop.intents) {
        expect(intent).toBeGreaterThanOrEqual(0);
        expect(intent).toBeLessThan(BOOP_INTENTS.length);
      }
    }
  });
});

describe('QA answer sets', () => {
  it('answers every item in the schema for full mode', () => {
    const { answers } = qaAnswerSet('full', 1);
    expect(Object.keys(answers).length).toBe(allItems().length);
  });

  it('produces values the schema accepts', () => {
    for (const mode of ['full', 'mirror', 'core-only', 'minimal'] as const) {
      const { answers } = qaAnswerSet(mode, 7);
      for (const [id, value] of Object.entries(answers)) {
        const ref = getItem(id);
        expect(ref, id).not.toBeNull();
        const item = ref!.item;
        if (item.type === 'multi') {
          expect(Array.isArray(value)).toBe(true);
          const picked = value as readonly number[];
          expect(picked.length).toBeGreaterThan(0);
          expect(new Set(picked).size).toBe(picked.length);
          for (const i of picked) expect(i).toBeLessThan(item.options.length);
        } else {
          const max =
            item.type === 'choice'
              ? item.options.length - 1
              : item.type === 'scale'
                ? SCALE_MAX
                : 3;
          expect(typeof value).toBe('number');
          expect(value as number).toBeGreaterThanOrEqual(0);
          expect(value as number).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('is deterministic — twins share a seed and therefore an answer set', () => {
    expect(qaAnswerSet('full', 1)).toEqual(qaAnswerSet('full', 1));
    expect(qaAnswerSet('full', 1)).not.toEqual(qaAnswerSet('full', 2));
  });

  it('mirrors full mode item by item', () => {
    const full = qaAnswerSet('full', 1).answers;
    const mirrored = qaAnswerSet('mirror', 1).answers;
    for (const { item } of allItems()) {
      if (item.type === 'scale') {
        expect(mirrored[item.id]).toBe(SCALE_MAX - (full[item.id] as number));
      } else if (item.type === 'interest') {
        expect(mirrored[item.id]).toBe(3 - (full[item.id] as number));
      } else if (item.type === 'choice') {
        expect(mirrored[item.id]).toBe(item.options.length - 1 - (full[item.id] as number));
      }
    }
  });

  it('narrows coverage for the partial and near-empty members', () => {
    expect(Object.keys(qaAnswerSet('core-only', 2).answers).length).toBe(coreItems().length);
    expect(Object.keys(qaAnswerSet('minimal', 3).answers).length).toBe(1);
  });

  // buildSharePayload demotes a dealbreaker whose acceptable set excludes
  // nothing or everything, so this asserts the weighting actually survives
  // into the payload rather than merely being set on the way in.
  it('sets importance that reaches the payload, dealbreaker included', () => {
    const { answers, weights, acceptable } = qaAnswerSet('full', 1);
    const payload = buildSharePayload(answers, [], null, weights, acceptable);
    expect(Object.values(payload.w ?? {})).toContain(2);
    expect(Object.values(payload.w ?? {})).toContain(3);
    expect(Object.keys(payload.d ?? {}).length).toBe(1);
  });

  it('gives the desires section answers worth revealing', () => {
    const { answers } = qaAnswerSet('full', 1);
    const desires = Object.entries(answers).filter(
      ([id, v]) => id.startsWith('dp.') && (v as number) >= 1,
    );
    expect(desires.length).toBeGreaterThan(0);
  });
});
