import { describe, expect, test } from 'vitest';
import { METRICS_BUCKET_RE, METRICS_MAX_BUCKETS } from './metrics-api';
import { buildMetricsBuckets, currentEpoch, debiasDesireRate, METRICS_ITEMS } from './buckets';
import { deriveEditKeys, deriveMetricsToken, deriveViewKeys } from '../hatch/keys';

describe('metrics buckets', () => {
  test('no age band → nothing leaves the device', () => {
    expect(buildMetricsBuckets({ 'sk.friend': 3, 'dp.rope': 3 })).toEqual([]);
  });

  test('coarsens each item family correctly, with denominators', () => {
    const buckets = buildMetricsBuckets({
      'ab.age': 1,
      'sk.friend': 3, // positive
      'sk.mono': 0, // negative
      'va.together': 5, // hi
      'va.novelty': 3, // mid
      'ls.alcohol': 2, // raw index
      'pl.cohabit': 3,
      'st.ideal': [0, 3],
      'ab.gender': [1], // identity-adjacent — must never appear
      'ls.pets': [0], // multi outside the curated shapes — must not appear
    });
    expect(buckets).toContain('age|1');
    expect(buckets).toContain('1|sk.friend|1');
    expect(buckets).toContain('1|sk.mono|0');
    expect(buckets).toContain('1|va.together|hi');
    expect(buckets).toContain('1|va.novelty|mid');
    expect(buckets).toContain('1|ls.alcohol|2');
    expect(buckets).toContain('1|pl.cohabit|3');
    expect(buckets).toContain('1|st.ideal|0');
    expect(buckets).toContain('1|st.ideal|3');
    expect(buckets).toContain('1|sk.friend|_n');
    expect(buckets).toContain('1|st.ideal|_n');
    expect(buckets.join(' ')).not.toContain('ab.gender');
    expect(buckets.join(' ')).not.toContain('ls.pets');
    for (const b of buckets) expect(b).toMatch(METRICS_BUCKET_RE);
    expect(buckets.length).toBeLessThanOrEqual(METRICS_MAX_BUCKETS);
  });

  test('a full answer set stays within the submission cap', () => {
    const answers: Record<string, number | number[]> = { 'ab.age': 3 };
    for (const id of METRICS_ITEMS) {
      answers[id] = id === 'st.ideal' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : 3;
    }
    const buckets = buildMetricsBuckets(answers);
    expect(buckets.length).toBeLessThanOrEqual(METRICS_MAX_BUCKETS);
  });

  test('desires ride randomized response at p(flip) = 0.25', () => {
    let flipped = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const buckets = buildMetricsBuckets({ 'ab.age': 0, 'dp.rope': 3 }); // truth = 1
      if (buckets.includes('0|dp.rope|0')) flipped++;
      expect(buckets).toContain('0|dp.rope|_n');
    }
    // Binomial(2000, .25): sd ≈ 19; ±6σ keeps this deterministic in practice.
    expect(flipped).toBeGreaterThan(n * 0.25 - 120);
    expect(flipped).toBeLessThan(n * 0.25 + 120);
  });

  test('debias inverts the noise', () => {
    expect(debiasDesireRate(250, 1000)).toBeCloseTo(0, 9); // all-negative truth
    expect(debiasDesireRate(750, 1000)).toBeCloseTo(1, 9); // all-positive truth
    expect(debiasDesireRate(500, 1000)).toBeCloseTo(0.5, 9);
    expect(debiasDesireRate(0, 0)).toBeNull();
  });

  test('epoch is UTC year-month', () => {
    expect(currentEpoch(Date.UTC(2026, 7, 23))).toBe('2026-08');
    expect(currentEpoch(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12');
  });

  test('the metrics token is unlinkable to view/edit locators', async () => {
    const phrase = 'amber-azure-fox-mistwoven-emberlit-fernhollow';
    const token = await deriveMetricsToken(phrase);
    const { viewLocator } = await deriveViewKeys(phrase);
    const { editLocator, editToken } = await deriveEditKeys('correct horse battery staple luck');
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).not.toBe(viewLocator);
    expect(token).not.toBe(editLocator);
    expect(token).not.toBe(editToken);
  }, 30000);
});
