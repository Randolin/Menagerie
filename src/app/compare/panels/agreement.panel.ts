import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { answerChips, itemLabel, sectionTitle, type AnswerValue, type Item } from '@moxy/core';
import { AgreementStripComponent, type AgreementRow } from '@moxy/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

function answerText(item: Item, v: AnswerValue): string {
  return answerChips(item, v)?.join(', ') ?? '?';
}

/** The shape of the agreement: every shared answer as a dot by similarity. */
@Component({
  selector: 'moxy-agreement-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgreementStripComponent],
  template: `
    <div class="card">
      <h2 i18n>Agreement, item by item</h2>
      <p i18n class="sub">
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
        label: sectionTitle(g.section),
        dots: g.rows
          .filter((r) => r.sim !== null && r.answeredCount === 2)
          .map((r) => ({
            sim: r.sim!,
            title:
              `${itemLabel(r.item)}: ` +
              `${answerText(r.item, r.answers[0]!)} vs ${answerText(r.item, r.answers[1]!)}`,
          })),
      }))
      .filter((row) => row.dots.length > 0),
  );
}
