import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { pct } from './series';

/** Similarity meter: sequential fill on a lighter same-ramp track. */
@Component({
  selector: 'mng-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter-row">
      <span class="meter-label">{{ label() }}</span>
      <div class="meter-track" role="img" [attr.aria-label]="described()">
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

  /**
   * The only sentence this chart says to a screen reader — so it is copy, and
   * copy in a binding has no `i18n-` form. It goes through `$localize` here.
   */
  protected readonly described = computed(
    () => $localize`${this.label()}:LABEL:: ${this.pct()}:PERCENT:% aligned`,
  );
}
