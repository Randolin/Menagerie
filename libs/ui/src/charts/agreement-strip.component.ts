import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface AgreementRow {
  readonly label: string;
  /** Dots: similarity 0..1 with a hover title. */
  readonly dots: readonly { readonly sim: number; readonly title: string }[];
}

/**
 * Agreement at a glance: one row per section, every shared answer as a dot
 * placed by its similarity. The shape of the dots — clustered right,
 * scattered, a lone outlier — is the story; hover names each item. Single
 * accent hue (person colors stay reserved for identity elsewhere).
 */
@Component({
  selector: 'moxy-agreement-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="agree-head">
      <span class="fine">← differ</span>
      <span class="fine">aligned →</span>
    </div>
    @for (row of rows(); track row.label) {
      <div class="agree-row">
        <span class="agree-label">{{ row.label }}</span>
        <svg
          [attr.viewBox]="'0 0 ' + W + ' ' + H"
          role="img"
          [attr.aria-label]="row.label + ': ' + row.dots.length + ' shared answers'"
        >
          <line
            [attr.x1]="PAD"
            [attr.y1]="H / 2"
            [attr.x2]="W - PAD"
            [attr.y2]="H / 2"
            stroke="var(--border)"
            stroke-width="2"
            stroke-linecap="round"
          />
          @for (dot of row.dots; track $index) {
            <circle
              [attr.cx]="x(dot.sim)"
              [attr.cy]="y($index)"
              r="4.5"
              fill="var(--accent)"
              fill-opacity="0.75"
              stroke="var(--surface)"
              stroke-width="1.5"
            >
              <title>{{ dot.title }}</title>
            </circle>
          }
        </svg>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .agree-head {
      display: flex;
      justify-content: space-between;
      margin: 0 0 2px 132px;
    }
    .agree-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 2px 0;
    }
    .agree-label {
      width: 122px;
      flex: none;
      text-align: right;
      font-size: 12.5px;
      color: var(--ink-2);
    }
    svg {
      flex: 1;
      height: 26px;
    }
  `,
})
export class AgreementStripComponent {
  readonly rows = input.required<readonly AgreementRow[]>();

  protected readonly W = 420;
  protected readonly H = 26;
  protected readonly PAD = 8;

  protected x(sim: number): number {
    return this.PAD + (this.W - 2 * this.PAD) * Math.max(0, Math.min(1, sim));
  }

  /** Slight deterministic vertical stagger so identical scores stay visible. */
  protected y(index: number): number {
    return this.H / 2 + [0, -5, 5][index % 3];
  }
}
