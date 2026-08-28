import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { itemLabel, type GridSection } from '@moxy/core';
import { AnswerTextComponent, SimDotComponent, seriesVar } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

const GRID_SECTIONS = ['about', 'lifestyle', 'connection', 'structure', 'plans'];

/** Everything else, in the open — the table-view twin of the charts. */
@Component({
  selector: 'moxy-answer-grid-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnswerTextComponent, SimDotComponent],
  template: `
    @for (g of sections(); track g.section.id) {
      <div class="card grid-section">
        <h2>{{ g.section.title }}</h2>
        @for (row of answeredRows(g); track row.item.id) {
          <div class="grid-row">
            <div class="grid-item-label">
              <moxy-sim-dot [sim]="row.sim" />
              {{ label(row.item) }}
            </div>
            <div class="grid-answers">
              @for (v of row.answers; track $index) {
                <div class="grid-answer">
                  <span
                    class="person-dot"
                    [style.background]="color($index)"
                    [title]="model().names[$index]"
                  ></span>
                  <moxy-answer-text [item]="row.item" [value]="v" />
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class AnswerGridPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();
  protected readonly color = seriesVar;

  protected readonly sections = computed(() =>
    GRID_SECTIONS.flatMap((id) => {
      const g = this.model().grid.find((x) => x.section.id === id);
      return g && g.rows.some((r) => r.answeredCount > 0) ? [g] : [];
    }),
  );

  protected answeredRows(g: GridSection): GridSection['rows'] {
    return g.rows.filter((r) => r.answeredCount > 0);
  }

  protected label(item: GridSection['rows'][number]['item']): string {
    return itemLabel(item);
  }
}
