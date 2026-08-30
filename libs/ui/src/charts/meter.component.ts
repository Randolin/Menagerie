import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { pct } from './series';

/** Similarity meter: sequential fill on a lighter same-ramp track. */
@Component({
  selector: 'mng-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter-row">
      <span class="meter-label">{{ label() }}</span>
      <div class="meter-track" role="img" [attr.aria-label]="label() + ': ' + pct() + '% aligned'">
        <div class="meter-fill" [style.width.%]="pct()"></div>
      </div>
      <span class="meter-value">{{ pct() }}%</span>
    </div>
  `,
})
export class MeterComponent {
  readonly score = input.required<number>();
  readonly label = input.required<string>();
  protected readonly pct = computed(() => pct(this.score()));
}
