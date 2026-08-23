import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Directional-fit dumbbell: two values on one 0–100 track, dots in person
 * series colors joined by a bar, so the asymmetry and its size read at a
 * glance. Labels and values wear text tokens; the dots carry identity.
 */
@Component({
  selector: 'moxy-dumbbell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img"
         [attr.aria-label]="labelA() + ' ' + pctA() + '%, ' + labelB() + ' ' + pctB() + '%'">
      <line [attr.x1]="PAD" [attr.y1]="TRACK_Y" [attr.x2]="W - PAD" [attr.y2]="TRACK_Y"
            stroke="var(--border)" stroke-width="4" stroke-linecap="round" />
      <line [attr.x1]="x(pctA())" [attr.y1]="TRACK_Y" [attr.x2]="x(pctB())" [attr.y2]="TRACK_Y"
            stroke="var(--baseline)" stroke-width="4" stroke-linecap="round" />
      <circle [attr.cx]="x(pctA())" [attr.cy]="TRACK_Y" r="7"
              fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" />
      <circle [attr.cx]="x(pctB())" [attr.cy]="TRACK_Y" r="7"
              fill="var(--series-2)" stroke="var(--surface)" stroke-width="2" />
      <text [attr.x]="x(pctA())" [attr.y]="labelYA()" text-anchor="middle"
            font-size="11" fill="var(--ink-2)">{{ labelA() }} · {{ pctA() }}%</text>
      <text [attr.x]="x(pctB())" [attr.y]="labelYB()" text-anchor="middle"
            font-size="11" fill="var(--ink-2)">{{ labelB() }} · {{ pctB() }}%</text>
      <text [attr.x]="PAD" [attr.y]="H - 4" font-size="9" fill="var(--muted)">0</text>
      <text [attr.x]="W - PAD" [attr.y]="H - 4" text-anchor="end" font-size="9"
            fill="var(--muted)">100</text>
    </svg>
  `,
  styles: `
    :host { display: block; max-width: 520px; }
    svg { width: 100%; height: auto; }
  `,
})
export class DumbbellComponent {
  /** 0..1 scores. */
  readonly scoreA = input.required<number>();
  readonly scoreB = input.required<number>();
  readonly labelA = input.required<string>();
  readonly labelB = input.required<string>();

  protected readonly W = 520;
  protected readonly H = 64;
  protected readonly PAD = 16;
  protected readonly TRACK_Y = 34;

  protected pctA(): number {
    return Math.round(this.scoreA() * 100);
  }
  protected pctB(): number {
    return Math.round(this.scoreB() * 100);
  }

  protected x(pct: number): number {
    return this.PAD + ((this.W - 2 * this.PAD) * Math.max(0, Math.min(100, pct))) / 100;
  }

  /** When the dots crowd, the labels split above/below; else both sit above. */
  private crowded = computed(() => Math.abs(this.pctA() - this.pctB()) < 18);
  protected labelYA(): number {
    return 16;
  }
  protected labelYB(): number {
    return this.crowded() ? 58 : 16;
  }
}
