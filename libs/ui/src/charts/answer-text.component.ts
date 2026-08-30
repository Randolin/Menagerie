import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { answerChips, type AnswerValue, type Item } from '@mng/core';

/**
 * Renders any open answer as readable text chips — the "table view twin" of
 * every chart. The item-type dispatch lives in core's answerChips, where a
 * new item type is a compile error until it renders.
 */
@Component({
  selector: 'mng-answer-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chips(); as chips) {
      <span class="answer-chips">
        @for (chip of chips; track $index) {
          <span class="answer-chip">{{ chip }}</span>
        }
      </span>
    } @else {
      <span class="answer-empty">—</span>
    }
  `,
})
export class AnswerTextComponent {
  readonly item = input.required<Item>();
  readonly value = input.required<AnswerValue | null | undefined>();

  protected readonly chips = computed(() => answerChips(this.item(), this.value()));
}
