import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InterestMatrixComponent } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

@Component({
  selector: 'moxy-seeking-matrix-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InterestMatrixComponent],
  template: `
    <div class="card">
      <h2>What each of you is open to</h2>
      <p class="sub">Highlighted rows are mutual — everyone answered is at least “Curious”.</p>
      <moxy-interest-matrix [rows]="rows()" [names]="model().names" />
    </div>
  `,
})
export class SeekingMatrixPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly rows = computed(() => {
    const grid = this.model().grid.find((g) => g.section.id === 'seeking');
    return grid ? grid.rows.filter((r) => r.answeredCount > 0) : [];
  });
}
