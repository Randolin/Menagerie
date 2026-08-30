import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { clamp01 } from './series';

/**
 * Completion ring: a single-accent progress donut on a recessive track.
 * It encodes one fraction — the caller renders the count as text beside it
 * (text wears text tokens, never a mark color). Full completion swaps the
 * arc for a filled check state.
 */
@Component({
  selector: 'mng-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="viewBox()"
      role="img"
      [attr.aria-label]="label()"
    >
      <circle
        [attr.cx]="c()"
        [attr.cy]="c()"
        [attr.r]="r()"
        fill="none"
        stroke="var(--border)"
        [attr.stroke-width]="stroke"
      />
      @if (fraction() > 0) {
        <circle
          [attr.cx]="c()"
          [attr.cy]="c()"
          [attr.r]="r()"
          fill="none"
          stroke="var(--accent)"
          [attr.stroke-width]="stroke"
          stroke-linecap="round"
          [attr.stroke-dasharray]="dash()"
          [attr.transform]="'rotate(-90 ' + c() + ' ' + c() + ')'"
        />
      }
      @if (fraction() >= 1) {
        <text
          [attr.x]="c()"
          [attr.y]="c()"
          text-anchor="middle"
          dominant-baseline="central"
          [attr.font-size]="size() * 0.5"
          fill="var(--accent)"
        >
          ✓
        </text>
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
})
export class RingComponent {
  /** 0..1 */
  readonly fraction = input.required<number>();
  readonly size = input(34);
  readonly label = input('completion');

  protected readonly stroke = 4;
  protected readonly c = computed(() => this.size() / 2);
  protected readonly r = computed(() => (this.size() - this.stroke) / 2);
  protected readonly viewBox = computed(() => `0 0 ${this.size()} ${this.size()}`);
  protected readonly dash = computed(() => {
    const circumference = 2 * Math.PI * this.r();
    const filled = clamp01(this.fraction()) * circumference;
    return `${filled} ${circumference - filled}`;
  });
}
