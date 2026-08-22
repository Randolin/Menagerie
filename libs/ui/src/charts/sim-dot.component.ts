import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Small similarity indicator on grid rows: bucketed sequential hue.
 * The value is also in the title, and the row's answers are plain text
 * beside it — color never carries the reading alone.
 */
@Component({
  selector: 'moxy-sim-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sim() === null) {
      <span class="sim-dot sim-none" title="Not comparable"></span>
    } @else {
      <span class="sim-dot sim-{{ bucket() }}" [title]="Math.round(sim()! * 100) + '% similar'"></span>
    }
  `,
})
export class SimDotComponent {
  readonly sim = input.required<number | null>();
  protected readonly Math = Math;
  protected readonly bucket = computed(() => {
    const s = this.sim();
    if (s === null) return 0;
    return s >= 0.85 ? 3 : s >= 0.55 ? 2 : s >= 0.3 ? 1 : 0;
  });
}
