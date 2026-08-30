import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartTableComponent, FlowComponent } from '@mng/ui';
import type { CompareModel, InterlockDetail } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

interface FlowView {
  readonly heading: string;
  readonly pct: number | null;
  readonly detail: InterlockDetail;
  /** The receiver's person index — the flow derives its series color. */
  readonly person: number;
}

/** The care interlock, drawn as a mechanism: offers meeting needs. */
@Component({
  selector: 'mng-interlock-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartTableComponent, FlowComponent],
  template: `
    <div class="panel">
      <h2 i18n>Care interlock</h2>
      <p i18n class="sub">
        Not similarity — coverage: what one naturally gives, laid against what the other needs to
        receive. A ribbon is a need met; a dangling need is worth a conversation, not a verdict.
      </p>
      @for (flow of flows(); track flow.heading) {
        <div style="margin-top:14px">
          <h3 style="margin:0 0 6px">
            {{ flow.heading }}
            @if (flow.pct !== null) {
              <span i18n class="fine">{{ flow.pct }}% covered</span>
            }
          </h3>
          <mng-flow
            [options]="flow.detail.options"
            [gives]="flow.detail.gives"
            [needs]="flow.detail.needs"
            [matched]="flow.detail.matched"
            [person]="flow.person"
          />
          <mng-chart-table
            i18n-caption
            caption="Each thing this person needs, and whether the other one naturally gives it"
            [columns]="tableColumns()"
            [rows]="tableRows(flow)"
          />
        </div>
      }
    </div>
  `,
})
export class InterlockPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly tableColumns = computed(() => [$localize`Need`, $localize`Given?`]);

  /**
   * The ribbons in words: one row per need, met or not.
   *
   * The diagram carries a `role="img"` summary that counts the covered needs,
   * which says how well it went and not what happened. Two of these tables sit
   * on the page — one per direction — and the direction is in the heading
   * above each, which is why the columns do not repeat it.
   */
  protected tableRows(flow: FlowView): string[][] {
    const label = (i: number) => flow.detail.options[i] ?? '?';
    return flow.detail.needs.map((need) => [
      label(need),
      flow.detail.matched.includes(need) ? $localize`Yes` : $localize`Not offered`,
    ]);
  }

  protected readonly flows = computed<FlowView[]>(() => {
    const m = this.model();
    return m.interlocks.flatMap((row) => [
      ...(row.detailA
        ? [
            {
              heading: `${m.names[1]} → ${m.names[0]}'s needs`,
              pct: row.forA === null ? null : Math.round(row.forA * 100),
              detail: row.detailA,
              person: 0,
            },
          ]
        : []),
      ...(row.detailB
        ? [
            {
              heading: `${m.names[0]} → ${m.names[1]}'s needs`,
              pct: row.forB === null ? null : Math.round(row.forB * 100),
              detail: row.detailB,
              person: 1,
            },
          ]
        : []),
    ]);
  });
}
