import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FlowComponent, seriesVar } from '@moxy/ui';
import type { CompareModel, InterlockDetail } from '../compare-model';
import type { ComparePanelComponent } from '../compare-panels.token';

interface FlowView {
  readonly heading: string;
  readonly pct: number | null;
  readonly detail: InterlockDetail;
  /** Ribbon color: the receiver's series color. */
  readonly color: string;
}

/** The care interlock, drawn as a mechanism: offers meeting needs. */
@Component({
  selector: 'moxy-interlock-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlowComponent],
  template: `
    <div class="card">
      <h2>Care interlock</h2>
      <p class="sub">
        Not similarity — coverage: what one naturally gives, laid against what the other needs to
        receive. A ribbon is a need met; a dangling need is worth a conversation, not a verdict.
      </p>
      @for (flow of flows(); track flow.heading) {
        <div style="margin-top:14px">
          <h3 style="margin:0 0 6px">
            {{ flow.heading }}
            @if (flow.pct !== null) {
              <span class="fine">{{ flow.pct }}% covered</span>
            }
          </h3>
          <moxy-flow
            [options]="flow.detail.options"
            [gives]="flow.detail.gives"
            [needs]="flow.detail.needs"
            [matched]="flow.detail.matched"
            [color]="flow.color"
          />
        </div>
      }
    </div>
  `,
})
export class InterlockPanel implements ComparePanelComponent {
  readonly model = input.required<CompareModel>();

  protected readonly flows = computed<FlowView[]>(() => {
    const m = this.model();
    return m.interlocks.flatMap((row) => [
      ...(row.detailA
        ? [
            {
              heading: `${m.names[1]} → ${m.names[0]}'s needs`,
              pct: row.forA === null ? null : Math.round(row.forA * 100),
              detail: row.detailA,
              color: seriesVar(0),
            },
          ]
        : []),
      ...(row.detailB
        ? [
            {
              heading: `${m.names[0]} → ${m.names[1]}'s needs`,
              pct: row.forB === null ? null : Math.round(row.forB * 100),
              detail: row.detailB,
              color: seriesVar(1),
            },
          ]
        : []),
    ]);
  });
}
