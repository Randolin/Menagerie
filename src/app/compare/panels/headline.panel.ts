import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { getItem, SECTIONS, sectionTitle } from '@moxy/core';
import {
  DumbbellComponent,
  MeterComponent,
  PairMatrixComponent,
  PersonKeyComponent,
  StatTileComponent,
} from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-headline-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DumbbellComponent,
    MeterComponent,
    PairMatrixComponent,
    PersonKeyComponent,
    StatTileComponent,
  ],
  template: `
    <div class="card">
      <h2>The headline</h2>
      <moxy-person-key [names]="model().names" [emojis]="personaEmojis()" />
      @for (alert of alerts(); track alert) {
        <div class="notice-warn notice">⛔ {{ alert }}</div>
      }
      <div class="stat-row">
        @if (overallPct(); as pct) {
          <moxy-stat-tile
            label="Overall alignment"
            [value]="pct + '%'"
            [sub]="'from ' + coverage() + ' shared answers'"
          />
        }
        <moxy-stat-tile
          label="Mutual connection types"
          [value]="'' + model().mutualSeekingCount"
          sub="both “Curious” or “Into it”"
        />
        @if (model().withTokensCount >= 2) {
          <moxy-stat-tile
            label="Mutual desires"
            [value]="'' + model().desireRows.length"
            sub="revealed because both said yes"
          />
        }
      </div>
      @if (fits(); as f) {
        <div style="margin-top:14px">
          <h3 style="margin-bottom:6px">Fit, each way</h3>
          <p class="fine" style="margin-top:0">
            Weighted by what each of you said matters — honestly different numbers.
          </p>
          <moxy-dumbbell
            [scoreA]="f.a"
            [scoreB]="f.b"
            [labelA]="'Fit for ' + model().names[0]"
            [labelB]="'Fit for ' + model().names[1]"
          />
        </div>
      }
      @if (model().pair) {
        <div style="margin-top:14px">
          @for (s of scoredSections(); track s.id) {
            <moxy-meter [score]="s.score" [label]="s.title" />
          }
        </div>
      } @else if (model().payloads.length > 2) {
        <div style="margin-top:14px">
          <h3>Pairwise alignment</h3>
          <moxy-pair-matrix [names]="model().names" [scores]="model().pairwise" />
        </div>
      }
    </div>
  `,
})
export class HeadlinePanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly personaEmojis = computed(() => this.model().emojis);

  protected readonly overallPct = computed(() => {
    const overall = this.model().pair?.overall;
    return overall == null ? null : Math.round(overall * 100);
  });

  protected readonly coverage = computed(() => this.model().pair?.coverage ?? 0);

  /** Directional fits — shown when the two directions actually differ. */
  protected readonly fits = computed(() => {
    const pair = this.model().pair;
    if (!pair || pair.fitA.overall == null || pair.fitB.overall == null) return null;
    const a = Math.round(pair.fitA.overall * 100);
    const b = Math.round(pair.fitB.overall * 100);
    if (a === b && a === this.overallPct()) return null;
    return { a: pair.fitA.overall, b: pair.fitB.overall };
  });

  /** Human sentences for violated dealbreakers, each named to its holder. */
  protected readonly alerts = computed(() => {
    const m = this.model();
    const pair = m.pair;
    if (!pair) return [];
    const describe = (holder: string, other: string, ids: readonly string[]) =>
      ids.map((id) => {
        const label = (getItem(id)?.item as { label?: string } | undefined)?.label ?? id;
        return `${other} differs on “${label}” — ${holder} marked it a dealbreaker.`;
      });
    return [
      ...describe(m.names[0], m.names[1], pair.fitA.alerts),
      ...describe(m.names[1], m.names[0], pair.fitB.alerts),
    ];
  });

  protected readonly scoredSections = computed(() => {
    const pair = this.model().pair;
    if (!pair) return [];
    return SECTIONS.flatMap((s) => {
      const score = s.privacy === 'open' ? pair.sections[s.id]?.score : undefined;
      return score === undefined ? [] : [{ id: s.id, title: sectionTitle(s), score }];
    });
  });
}
