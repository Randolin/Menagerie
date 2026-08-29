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
      <h2 i18n>What each of you is open to</h2>
      <p i18n class="sub">Highlighted rows are mutual — everyone answered is at least “Curious”.</p>
      <!-- No "read as a table" here: moxy-interest-matrix already IS a table,
           with scoped headers and a visible level label in every cell. A
           second one would be duplication a screen reader has to wade through
           twice. -->
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
