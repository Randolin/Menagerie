import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SCALE_MAX, itemLabel, type ScaleItem } from '@moxy/core';
import { ChartTableComponent, PersonKeyComponent, ScaleStripComponent } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-values-strips-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartTableComponent, PersonKeyComponent, ScaleStripComponent],
  template: `
    <div class="card">
      <h2>Values, side by side</h2>
      <p class="sub">Each dot is a person. Distance between dots is the actual gap.</p>
      <moxy-person-key [names]="model().names" [emojis]="model().emojis" />
      @for (row of rows(); track row.item.id) {
        <moxy-scale-strip
          [item]="asScale(row.item)"
          [answers]="row.answers"
          [names]="model().names"
        />
      }
      <moxy-chart-table
        caption="Each values scale, with every profile's answer out of the scale maximum"
        [columns]="tableColumns()"
        [rows]="tableRows()"
      />
    </div>
  `,
})
export class ValuesStripsPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly rows = computed(() => {
    const grid = this.model().grid.find((g) => g.section.id === 'values');
    return grid ? grid.rows.filter((r) => r.answeredCount > 0) : [];
  });

  protected readonly tableColumns = computed(() => ['Value', ...this.model().names]);

  protected readonly tableRows = computed(() =>
    this.rows().map((row) => [
      itemLabel(row.item),
      // A dash, not a zero: unanswered and "answered zero" are different
      // things, and a table that blurs them lies about the strip above it.
      ...row.answers.map((a) => (typeof a === 'number' ? `${a}/${SCALE_MAX}` : '—')),
    ]),
  );

  protected asScale(item: unknown): ScaleItem {
    return item as ScaleItem;
  }
}
