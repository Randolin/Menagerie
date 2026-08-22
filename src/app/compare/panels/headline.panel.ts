import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SECTIONS } from '@moxy/core';
import { MeterComponent, PairMatrixComponent, PersonKeyComponent, StatTileComponent } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-headline-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeterComponent, PairMatrixComponent, PersonKeyComponent, StatTileComponent],
  template: `
    <div class="card">
      <h2>The headline</h2>
      <moxy-person-key [names]="model().names" [emojis]="personaEmojis()" />
      <div class="stat-row">
        @if (overallPct(); as pct) {
          <moxy-stat-tile label="Overall alignment" [value]="pct + '%'"
                          sub="weighted across answered sections" />
        }
        <moxy-stat-tile label="Mutual connection types"
                        [value]="'' + model().mutualSeekingCount"
                        sub="both “Curious” or “Into it”" />
        @if (model().withTokensCount >= 2) {
          <moxy-stat-tile label="Mutual desires" [value]="'' + model().desireRows.length"
                          sub="revealed because both said yes" />
        }
      </div>
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

  protected readonly personaEmojis = computed(() =>
    this.model().personas.map((p) => p?.emoji ?? null),
  );

  protected readonly overallPct = computed(() => {
    const overall = this.model().pair?.overall;
    return overall == null ? null : Math.round(overall * 100);
  });

  protected readonly scoredSections = computed(() => {
    const pair = this.model().pair;
    if (!pair) return [];
    return SECTIONS.flatMap((s) => {
      const score = s.privacy === 'open' ? pair.sections[s.id]?.score : undefined;
      return score === undefined ? [] : [{ id: s.id, title: s.title, score }];
    });
  });
}
