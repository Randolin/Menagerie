import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interestLabel, type AnswerValue, type Item } from '@moxy/core';

/**
 * Renders any open answer as readable text chips — the "table view twin" of
 * every chart. Adding a new item TYPE requires a branch here (exhaustiveness
 * is checked in the chips() computed).
 */
@Component({
  selector: 'moxy-answer-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (display(); as d) {
      @switch (d.kind) {
        @case ('empty') {
          <span class="answer-empty">—</span>
        }
        @case ('chips') {
          <span class="answer-chips">
            @for (chip of d.chips; track $index) {
              <span class="answer-chip">{{ chip }}</span>
            }
          </span>
        }
      }
    }
  `,
})
export class AnswerTextComponent {
  readonly item = input.required<Item>();
  readonly value = input.required<AnswerValue | null | undefined>();

  protected readonly display = computed(
    (): { kind: 'empty' } | { kind: 'chips'; chips: string[] } => {
      const v = this.value();
      if (v === null || v === undefined) return { kind: 'empty' };
      const item = this.item();
      switch (item.type) {
        case 'choice':
          return { kind: 'chips', chips: [item.options[v as number] ?? '?'] };
        case 'multi':
          return {
            kind: 'chips',
            chips: (Array.isArray(v) ? v : []).map((i) => item.options[i] ?? '?'),
          };
        case 'scale':
          return { kind: 'chips', chips: [`${v}/6`] };
        case 'interest':
          return { kind: 'chips', chips: [interestLabel(v as number)] };
        default: {
          const exhaustive: never = item;
          return exhaustive;
        }
      }
    },
  );
}
