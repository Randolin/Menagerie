import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { seriesVar } from './series';

/**
 * Bipartite interlock flow for one give→receive direction: what the giver
 * offers on the left, what the receiver needs on the right, a ribbon where
 * an offer meets a need. Unmet needs stay visibly dangling with an explicit
 * tag — the diagram shows the mechanism, not just a score. Ribbons wear the
 * receiver's series color; all text wears text tokens.
 */
@Component({
  selector: 'mng-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + height()" role="img" [attr.aria-label]="described()">
      <text
        i18n
        [attr.x]="0"
        [attr.y]="12"
        text-anchor="start"
        class="flow-col"
        fill="var(--muted)"
      >
        gives
      </text>
      <text
        i18n
        [attr.x]="RIGHT_X"
        [attr.y]="12"
        text-anchor="start"
        class="flow-col"
        fill="var(--muted)"
      >
        needs
      </text>
      @for (g of gives(); track g; let i = $index) {
        <text
          [attr.x]="0"
          [attr.y]="rowY(i)"
          text-anchor="start"
          dominant-baseline="middle"
          class="flow-label"
          fill="var(--ink)"
        >
          {{ label(g) }}
        </text>
      }
      @for (n of needs(); track n; let i = $index) {
        <text
          [attr.x]="RIGHT_X"
          [attr.y]="rowY(i)"
          text-anchor="start"
          dominant-baseline="middle"
          class="flow-label"
          [attr.fill]="isMatched(n) ? 'var(--ink)' : 'var(--muted)'"
        >
          {{ label(n) }}
        </text>
        @if (!isMatched(n)) {
          <text
            i18n
            [attr.x]="RIGHT_X"
            [attr.y]="rowY(i) + UNMET_DY"
            text-anchor="start"
            class="flow-unmet"
            fill="var(--muted)"
          >
            unmet
          </text>
          <line
            [attr.x1]="RIGHT_X - 34"
            [attr.y1]="rowY(i)"
            [attr.x2]="RIGHT_X - 6"
            [attr.y2]="rowY(i)"
            stroke="var(--border)"
            stroke-width="2"
            stroke-dasharray="3 4"
          />
        }
      }
      @for (ribbon of ribbons(); track ribbon.option) {
        <path
          [attr.d]="ribbon.d"
          fill="none"
          [attr.stroke]="color(person())"
          stroke-width="2.5"
          stroke-linecap="round"
          opacity="0.85"
        />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      max-width: 440px;
    }
    /* Type sizes live here rather than on font-size attributes, because they
       have to change with the viewport and an attribute cannot. In SVG a CSS
       font-size is in USER units, so these are viewBox numbers, not CSS px —
       what a reader sees is the number times the viewBox scale. */
    .flow-col {
      font-size: 10px;
    }
    .flow-label {
      font-size: 11.5px;
    }
    .flow-unmet {
      font-size: 9px;
    }

    /* A 420-unit box in a phone's ~320px column scales to about 0.77, which
       took an 11.5-unit label to roughly 9 CSS px and the "unmet" tag to 7 —
       small enough that the diagram stopped being readable and started being
       decoration. Scaling the type up in user units lands it back where it
       sits on a desktop. */
    @media (max-width: 560px) {
      .flow-col {
        font-size: 13px;
      }
      .flow-label {
        font-size: 15px;
      }
      .flow-unmet {
        font-size: 11.5px;
      }
    }

    svg {
      width: 100%;
      height: auto;
    }
  `,
})
export class FlowComponent {
  /** Option labels shared by both columns. */
  readonly options = input.required<readonly string[]>();
  /** Option indexes the giver offers (left column). */
  readonly gives = input.required<readonly number[]>();
  /** Option indexes the receiver needs (right column). */
  readonly needs = input.required<readonly number[]>();
  /** Needs that the gives cover (subset of needs). */
  readonly matched = input.required<readonly number[]>();
  /** The receiver's person index — ribbons wear their series color. */
  readonly person = input.required<number>();

  protected readonly W = 420;
  protected readonly LEFT_X = 160;
  protected readonly RIGHT_X = 260;
  private readonly TOP = 24;
  private readonly ROW = 30;

  /**
   * Baseline of the "unmet" tag below its need's centre line.
   *
   * It was 11, tuned against a 9-unit tag under an 11.5-unit label. Growing
   * the type for phones (see the styles) made the tag land inside the label
   * above it, because this offset is a template expression and no media query
   * reaches it. 16 clears the larger pair and still sits well inside the
   * 30-unit row.
   */
  protected readonly UNMET_DY = 16;

  /** Copy in a binding — no `i18n-` form exists, so `$localize` it here. */
  protected readonly described = computed(
    () =>
      $localize`${this.matched().length}:COVERED: of ${this.needs().length}:TOTAL: needs covered`,
  );

  protected readonly height = computed(
    () => this.TOP + Math.max(this.gives().length, this.needs().length, 1) * this.ROW,
  );

  protected rowY(i: number): number {
    return this.TOP + i * this.ROW + this.ROW / 2 - 4;
  }

  protected label(optionIndex: number): string {
    return this.options()[optionIndex] ?? '?';
  }

  protected isMatched(optionIndex: number): boolean {
    return this.matched().includes(optionIndex);
  }

  protected readonly color = seriesVar;

  protected readonly ribbons = computed(() => {
    const giveRow = new Map(this.gives().map((option, i) => [option, i]));
    const needRow = new Map(this.needs().map((option, i) => [option, i]));
    return this.matched()
      .filter((option) => giveRow.has(option) && needRow.has(option))
      .map((option) => {
        const x1 = this.LEFT_X + 8;
        const y1 = this.rowY(giveRow.get(option)!);
        const x2 = this.RIGHT_X - 8;
        const y2 = this.rowY(needRow.get(option)!);
        const mx = (x1 + x2) / 2;
        return { option, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` };
      });
  });
}
