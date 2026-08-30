import { type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildDemoCast, personaFromViewPhrase } from '@mng/core';
import { buildCompareModel, type CompareModel, type CompareSlot } from '../compare-model';
import { AgreementPanel } from './agreement.panel';
import { InterlockPanel } from './interlock.panel';
import { SeekingMatrixPanel } from './seeking-matrix.panel';
import { ValuesStripsPanel } from './values-strips.panel';

/**
 * Every chart carries role="img" and a one-line summary, which says a shape
 * exists without saying what it says. These tables are the rest of it, so
 * what matters is that the numbers in them are the numbers the chart drew.
 */
async function demoModel(): Promise<CompareModel> {
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

function render<T>(type: Type<T>, model: CompareModel): HTMLElement {
  const fixture = TestBed.createComponent(type);
  fixture.componentRef.setInput('model', model);
  fixture.detectChanges();
  return fixture.nativeElement;
}

/** Rows as [header, ...cells], the way a screen reader would walk them. */
function tableRows(el: HTMLElement): string[][] {
  return [...el.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim() ?? ''),
  );
}

describe('chart tables', () => {
  let model: CompareModel;

  beforeEach(async () => {
    model = await demoModel();
    await TestBed.configureTestingModule({}).compileComponents();
  });

  // Inherited from the radar's table when the radar went. The values data
  // did not go with it — the strips show the same scales, legibly — so the
  // assertion moved to the panel that carries it now rather than being
  // deleted along with the chart it was written for.
  it('gives the values table its scales as rows and its people as columns', () => {
    const el = render(ValuesStripsPanel, model);
    const headers = [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Value', 'brave-azure-otter', 'calm-bright-owl']);

    const rows = tableRows(el);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // The answers themselves, not the 0..1 the strip positions dots with.
    for (const row of rows) {
      expect(row[1]).toMatch(/^\d\/\d$/);
      expect(row[2]).toMatch(/^\d\/\d$/);
    }
  });

  // The interest matrix is already a table with scoped headers and a visible
  // level in every cell, so it gets no second one — and must not grow one.
  it('leaves the interest matrix as the single table it already is', () => {
    const el = render(SeekingMatrixPanel, model);
    expect(el.querySelectorAll('table')).toHaveLength(1);
    expect(el.querySelector('details.chart-table')).toBeNull();
    const friendship = tableRows(el).find((row) => row[0] === 'Friendship');
    expect(friendship?.slice(0, 3)).toEqual(['Friendship', 'Into it', 'Into it']);
  });

  // The strip keeps the question and both answers in an SVG <title>, which is
  // a hover tooltip — nothing at all on a phone, where there is also no room
  // for the dots to be more than a few pixels wide. For this panel the table
  // is not the fallback; for most readers it is the panel.
  it('gives the agreement strip every dot as a readable row', () => {
    const el = render(AgreementPanel, model);
    const headers = [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Question', 'brave-azure-otter', 'calm-bright-owl', 'Agreement']);

    const rows = tableRows(el);
    // One row per dot, and no dot without a row.
    const dots = el.querySelectorAll('.agree-row svg circle');
    expect(dots.length).toBeGreaterThan(0);
    expect(rows.length).toBe(dots.length);
    for (const row of rows) {
      expect(row[1]).not.toBe('');
      expect(row[2]).not.toBe('');
      expect(row[3]).toMatch(/^\d{1,3}%$/);
    }
  });

  it('gives each interlock direction its needs as met-or-not rows', () => {
    const el = render(InterlockPanel, model);
    // One table per direction — the heading above each says whose needs.
    const tables = el.querySelectorAll('details.chart-table');
    expect(tables.length).toBe(el.querySelectorAll('mng-flow').length);
    expect(tables.length).toBeGreaterThan(0);

    const rows = tableRows(el);
    expect(rows.length).toBeGreaterThan(0);
    // "Not offered", never a blank: a dangling need is the finding, and a
    // table that leaves the cell empty reads as missing data instead.
    for (const row of rows) {
      expect(row[1]).toMatch(/^(Yes|Not offered)$/);
    }
    expect(rows.some((row) => row[1] === 'Not offered')).toBe(true);
  });

  it('marks an unanswered scale as absent rather than as zero', async () => {
    // One profile answers a values scale the other never touched.
    const [first, second] = model.slots;
    const thinnedAnswers = { ...second.payload!.a };
    delete thinnedAnswers['va.together'];
    const thinned: CompareSlot = {
      ...second,
      payload: { ...second.payload!, a: thinnedAnswers },
    };

    const rows = tableRows(render(ValuesStripsPanel, await buildCompareModel([first, thinned])));
    const together = rows.find((row) => row[0].includes('Togetherness'));
    // A dash, not a zero: "did not answer" and "answered zero" are different
    // facts, and the strip above draws only one dot for this row.
    expect(together?.[2]).toBe('—');
  });
});
