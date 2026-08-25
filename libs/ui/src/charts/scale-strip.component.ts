import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AnswerValue, ScaleItem } from '@moxy/core';
import { seriesVar } from './series';

interface StripDot {
  readonly personIdx: number;
  readonly value: number;
  readonly offsetPx: number;
}

/**
 * Dot strip for a bipolar 0–6 scale: one shared axis, a dot per person —
 * the gap between dots IS the disagreement. Dots landing on the same value
 * stack vertically with surface rings.
 */
@Component({
  selector: 'moxy-scale-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip-row">
      <div class="strip-anchors">
        <span class="anchor">{{ item().left }}</span>
        @if (gapBadge(); as badge) {
          <span
            class="badge"
            [class.badge-close]="badge === 'in sync'"
            [class.badge-gap]="badge === 'big gap'"
            >{{ badge }}</span
          >
        }
        <span class="anchor anchor-right">{{ item().right }}</span>
      </div>
      <div class="strip-track">
        @for (dot of dots(); track dot.personIdx) {
          <span
            class="strip-dot"
            [style.left.%]="(dot.value / 6) * 100"
            [style.background]="color(dot.personIdx)"
            [style.transform]="'translate(-50%, calc(-50% + ' + dot.offsetPx + 'px))'"
            [title]="names()[dot.personIdx] + ': ' + dot.value + '/6'"
          ></span>
        }
      </div>
    </div>
  `,
})
export class ScaleStripComponent {
  readonly item = input.required<ScaleItem>();
  readonly answers = input.required<readonly (AnswerValue | null)[]>();
  readonly names = input.required<readonly string[]>();
  protected readonly color = seriesVar;

  protected readonly dots = computed<StripDot[]>(() => {
    const byValue = new Map<number, number[]>();
    this.answers().forEach((v, i) => {
      if (typeof v !== 'number') return;
      const list = byValue.get(v) ?? [];
      list.push(i);
      byValue.set(v, list);
    });
    const out: StripDot[] = [];
    for (const [value, people] of byValue) {
      people.forEach((personIdx, stackIdx) => {
        out.push({ personIdx, value, offsetPx: (stackIdx - (people.length - 1) / 2) * 10 });
      });
    }
    return out;
  });

  protected readonly gapBadge = computed<'in sync' | 'big gap' | null>(() => {
    const answered = this.answers().filter((v): v is number => typeof v === 'number');
    if (answered.length < 2) return null;
    const gap = Math.max(...answered) - Math.min(...answered);
    if (gap <= 1) return 'in sync';
    if (gap >= 4) return 'big gap';
    return null;
  });
}
