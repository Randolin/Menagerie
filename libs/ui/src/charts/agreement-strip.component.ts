import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { clamp01 } from './series';

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
  selector: 'mng-agreement-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="agree-head">
      <span i18n class="fine">← differ</span>
      <span i18n class="fine">aligned →</span>
    </div>
    @for (row of rows(); track row.label) {
      <div class="agree-row">
        <span class="agree-label">{{ row.label }}</span>
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="describe(row)">
          <!-- Edge to edge, not inset by PAD: the "differ"/"aligned" legend is
               positioned in CSS and cannot know how the viewBox scaled, so the
               track has to end where the row ends for the two to line up. PAD
               still keeps the dots themselves off the edge. -->
          <line
            [attr.x1]="0"
            [attr.y1]="H / 2"
            [attr.x2]="W"
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
    /* height:auto is load-bearing. With a fixed height the 420×26 viewBox
       meets that height first and lands centred in whatever width is left —
       a track floating in the middle of the column with the axis legend
       nowhere near its ends. Scaling by width instead fills the row, and
       scales uniformly, so the dots stay round and grow into a real hit
       target on a wide screen. */
    svg {
      flex: 1;
      width: 100%;
      height: auto;
    }

    /* On a phone the label column is most of the row. Give the track the
       whole width and put the label above it, as the meters do. */
    @media (max-width: 560px) {
      .agree-head {
        margin-left: 0;
      }
      .agree-row {
        display: block;
        margin: 10px 0;
      }
      .agree-label {
        display: block;
        width: auto;
        text-align: left;
      }
    }
  `,
})
export class AgreementStripComponent {
  readonly rows = input.required<readonly AgreementRow[]>();

  protected readonly W = 420;
  protected readonly H = 26;
  protected readonly PAD = 8;

  /** Copy in a binding — no `i18n-` form exists, so `$localize` it here. */
  protected describe(row: AgreementRow): string {
    return $localize`${row.label}:SECTION:: ${row.dots.length}:COUNT: shared answers`;
  }

  protected x(sim: number): number {
    return this.PAD + (this.W - 2 * this.PAD) * clamp01(sim);
  }

  /** Slight deterministic vertical stagger so identical scores stay visible. */
  protected y(index: number): number {
    return this.H / 2 + [0, -5, 5][index % 3];
  }
}
