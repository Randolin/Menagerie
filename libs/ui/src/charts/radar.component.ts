import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { clamp01, seriesVar } from './series';

export interface RadarSeries {
  readonly name: string;
  /** One value per axis, normalized to 0..1. */
  readonly values: readonly number[];
}

/**
 * Radar / fingerprint overlay: each series is one person's shape over the
 * same axes. Recessive rings and spokes, 2px series strokes with a faint
 * fill, axis labels in muted ink; identity comes from the person-key legend
 * the caller renders (fixed series slots, never cycled).
 */
@Component({
  selector: 'moxy-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + W + ' ' + W"
      role="img"
      [attr.aria-label]="'Fingerprint overlay across ' + axes().length + ' dimensions'"
    >
      @for (ring of rings; track $index) {
        <polygon
          [attr.points]="ringPoints(ring)"
          fill="none"
          stroke="var(--border)"
          stroke-width="1"
        />
      }
      @for (a of axes(); track $index; let i = $index) {
        <line
          [attr.x1]="C"
          [attr.y1]="C"
          [attr.x2]="pt(i, 1)[0]"
          [attr.y2]="pt(i, 1)[1]"
          stroke="var(--border)"
          stroke-width="1"
        />
        <text
          [attr.x]="labelPt(i)[0]"
          [attr.y]="labelPt(i)[1]"
          [attr.text-anchor]="anchor(i)"
          dominant-baseline="middle"
          font-size="10"
          fill="var(--muted)"
        >
          {{ a }}
        </text>
      }
      @for (s of series(); track s.name; let si = $index) {
        <polygon
          [attr.points]="seriesPoints(s)"
          [attr.stroke]="color(si)"
          stroke-width="2"
          stroke-linejoin="round"
          [attr.fill]="color(si)"
          fill-opacity="0.12"
        />
        @for (v of s.values; track $index; let ai = $index) {
          <circle
            [attr.cx]="pt(ai, v)[0]"
            [attr.cy]="pt(ai, v)[1]"
            r="3"
            [attr.fill]="color(si)"
            stroke="var(--surface)"
            stroke-width="2"
          />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      max-width: 460px;
      margin-inline: auto;
    }
    svg {
      width: 100%;
      height: auto;
    }
  `,
})
export class RadarComponent {
  readonly axes = input.required<readonly string[]>();
  readonly series = input.required<readonly RadarSeries[]>();

  protected readonly W = 460;
  protected readonly C = 230;
  private readonly R = 120;
  protected readonly rings = [1 / 3, 2 / 3, 1];

  private angle(i: number): number {
    return -Math.PI / 2 + (2 * Math.PI * i) / this.axes().length;
  }

  protected pt(i: number, r: number): [number, number] {
    const a = this.angle(i);
    return [this.C + this.R * r * Math.cos(a), this.C + this.R * r * Math.sin(a)];
  }

  protected labelPt(i: number): [number, number] {
    const a = this.angle(i);
    const r = this.R + 12;
    return [this.C + r * Math.cos(a), this.C + r * Math.sin(a)];
  }

  protected anchor(i: number): string {
    const x = Math.cos(this.angle(i));
    if (x > 0.3) return 'start';
    if (x < -0.3) return 'end';
    return 'middle';
  }

  protected ringPoints(r: number): string {
    return this.axes()
      .map((_, i) => this.pt(i, r).join(','))
      .join(' ');
  }

  protected seriesPoints(s: RadarSeries): string {
    return s.values.map((v, i) => this.pt(i, clamp01(v)).join(',')).join(' ');
  }

  protected readonly color = seriesVar;
}
