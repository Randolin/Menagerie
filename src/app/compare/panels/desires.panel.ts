import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { interestLevelLabel } from '@moxy/core';
import { seriesVar } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-desires-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <h2>Desires — mutual only</h2>
      @if (model().withTokensCount === 1) {
        <p class="sub">
          Only one of these profiles filled in the desires section, so there is nothing to mutually
          reveal.
        </p>
      } @else {
        @if (model().withTokensCount < model().payloads.length) {
          <p class="fine">
            Not every profile here filled in the desires section; reveals below are among those that
            did.
          </p>
        }
        @if (model().desireRows.length > 0) {
          <p class="sub">
            These appear because everyone (or at least two of you) marked them. One-sided desires
            stay hidden — neither of you learns the other was asked.
          </p>
          @for (row of model().desireRows; track row.item.id) {
            <div class="reveal-card">
              <div class="reveal-title">{{ row.item.label }}</div>
              <div class="reveal-levels">
                @for (lvl of row.levels; track $index) {
                  @if (lvl >= 1) {
                    <span>
                      <span class="person-dot" [style.background]="color($index)"></span>
                      {{ ' ' + model().names[$index] + ': ' + levelLabel(lvl) }}
                    </span>
                  }
                }
              </div>
            </div>
          }
        } @else {
          <p class="sub">
            No mutual desires surfaced — which only means nothing overlapped among the answers
            given. One-sided answers stay invisible by design.
          </p>
        }
      }
    </div>
  `,
})
export class DesiresPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();
  protected readonly color = seriesVar;
  protected readonly levelLabel = interestLevelLabel;
}
