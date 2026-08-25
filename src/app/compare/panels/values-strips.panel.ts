import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScaleItem } from '@moxy/core';
import { PersonKeyComponent, ScaleStripComponent } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-values-strips-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PersonKeyComponent, ScaleStripComponent],
  template: `
    <div class="card">
      <h2>Values, side by side</h2>
      <p class="sub">Each dot is a person. Distance between dots is the actual gap.</p>
      <moxy-person-key [names]="model().names" [emojis]="personaEmojis()" />
      @for (row of rows(); track row.item.id) {
        <moxy-scale-strip
          [item]="asScale(row.item)"
          [answers]="row.answers"
          [names]="model().names"
        />
      }
    </div>
  `,
})
export class ValuesStripsPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly personaEmojis = computed(() =>
    this.model().personas.map((p) => p?.emoji ?? null),
  );

  protected readonly rows = computed(() => {
    const grid = this.model().grid.find((g) => g.section.id === 'values');
    return grid ? grid.rows.filter((r) => r.answeredCount > 0) : [];
  });

  protected asScale(item: unknown): ScaleItem {
    return item as ScaleItem;
  }
}
