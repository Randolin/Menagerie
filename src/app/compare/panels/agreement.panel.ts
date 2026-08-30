import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { answerChips, itemLabel, sectionTitle, type AnswerValue, type Item } from '@mng/core';
import { AgreementStripComponent, ChartTableComponent, pct, type AgreementRow } from '@mng/ui';
import type { CompareModel } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

function answerText(item: Item, v: AnswerValue): string {
  return answerChips(item, v)?.join(', ') ?? '?';
}

/** The shape of the agreement: every shared answer as a dot by similarity. */
@Component({
  selector: 'mng-agreement-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgreementStripComponent, ChartTableComponent],
  template: `
    <div class="panel">
      <h2 i18n>Agreement, item by item</h2>
      <p i18n class="sub">
        Every question you both answered, placed by how closely your answers sit — the table below
        is the same thing in words.
      </p>
      <mng-agreement-strip [rows]="rows()" />
      <mng-chart-table
        i18n-caption
        caption="Every question you both answered, with each person's answer and how closely the two sit"
        [columns]="tableColumns()"
        [rows]="tableRows()"
      />
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

  protected readonly tableColumns = computed(() => [
    $localize`Question`,
    ...this.model().names,
    $localize`Agreement`,
  ]);

  /**
   * The strip's own numbers, in words.
   *
   * This one is not a courtesy. The strip puts every shared answer on a
   * differ↔aligned axis and keeps the question and both answers in a hover
   * tooltip — which is no answer at all on a phone, where there is no hover
   * and the dots are four pixels wide. The table is how most people will
   * actually read this panel.
   */
  protected readonly tableRows = computed(() =>
    this.model().grid.flatMap((g) =>
      g.rows
        .filter((r) => r.sim !== null && r.answeredCount === 2)
        .map((r) => [
          itemLabel(r.item),
          answerText(r.item, r.answers[0]!),
          answerText(r.item, r.answers[1]!),
          `${pct(r.sim!)}%`,
        ]),
    ),
  );
}
