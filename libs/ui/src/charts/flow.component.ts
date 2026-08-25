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
  selector: 'moxy-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + W + ' ' + height()"
      role="img"
      [attr.aria-label]="matched().length + ' of ' + needs().length + ' needs covered'"
    >
      <text [attr.x]="LEFT_X" [attr.y]="12" text-anchor="end" font-size="10" fill="var(--muted)">
        gives
      </text>
      <text [attr.x]="RIGHT_X" [attr.y]="12" text-anchor="start" font-size="10" fill="var(--muted)">
        needs
      </text>
      @for (g of gives(); track g; let i = $index) {
        <text
          [attr.x]="LEFT_X"
          [attr.y]="rowY(i)"
          text-anchor="end"
          dominant-baseline="middle"
          font-size="11.5"
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
          font-size="11.5"
          [attr.fill]="isMatched(n) ? 'var(--ink)' : 'var(--muted)'"
        >
          {{ label(n) }}
        </text>
        @if (!isMatched(n)) {
          <text
            [attr.x]="RIGHT_X"
            [attr.y]="rowY(i) + 11"
            text-anchor="start"
            font-size="9"
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
