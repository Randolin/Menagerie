import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interestLabel, type AnswerValue, type Item } from '@moxy/core';
import { AgreementStripComponent, type AgreementRow } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

function answerText(item: Item, v: AnswerValue): string {
  switch (item.type) {
    case 'choice':
      return item.options[v as number] ?? '?';
    case 'multi':
      return (Array.isArray(v) ? v : []).map((i) => item.options[i] ?? '?').join(', ');
    case 'scale':
      return `${v}/6`;
    case 'interest':
      return interestLabel(v as number);
  }
}

/** The shape of the agreement: every shared answer as a dot by similarity. */
@Component({
  selector: 'moxy-agreement-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgreementStripComponent],
  template: `
    <div class="card">
      <h2>Agreement, item by item</h2>
      <p class="sub">
        Every question you both answered, placed by how closely your answers sit. Hover a dot to see
        the question and both answers.
      </p>
      <moxy-agreement-strip [rows]="rows()" />
    </div>
  `,
})
export class AgreementPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly rows = computed<AgreementRow[]>(() =>
    this.model()
      .grid.map((g) => ({
        label: g.section.title,
        dots: g.rows
          .filter((r) => r.sim !== null && r.answeredCount === 2)
          .map((r) => ({
            sim: r.sim!,
            title:
              ('label' in r.item ? r.item.label : `${r.item.left} ↔ ${r.item.right}`) +
              `: ${answerText(r.item, r.answers[0]!)} vs ${answerText(r.item, r.answers[1]!)}`,
          })),
      }))
      .filter((row) => row.dots.length > 0),
  );
}
