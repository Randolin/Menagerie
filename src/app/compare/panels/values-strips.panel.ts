import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SCALE_MAX, itemLabel, type ScaleItem } from '@mng/core';
import { ChartTableComponent, ScaleStripComponent } from '@mng/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'mng-values-strips-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartTableComponent, ScaleStripComponent],
  template: `
    <div class="panel">
      <h2 i18n>Values, side by side</h2>
      <p i18n class="sub">Each dot is a person. Distance between dots is the actual gap.</p>
      @for (row of rows(); track row.item.id) {
        <mng-scale-strip
          [item]="asScale(row.item)"
          [answers]="row.answers"
          [names]="model().names"
        />
      }
      <mng-chart-table
        i18n-caption
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

  protected readonly tableColumns = computed(() => [$localize`Value`, ...this.model().names]);

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
