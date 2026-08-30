import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  INTEREST_LEVELS,
  interestLevelLabels,
  itemLabel,
  type AnswerValue,
  type InterestItem,
} from '@mng/core';
import { OptionGroupDirective } from '@mng/ui';

@Component({
  selector: 'mng-interest-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="pip-row" mngOptionGroup role="group" [attr.aria-label]="label()">
      @for (level of levels(); track level.value) {
        <button
          type="button"
          class="pip pip-interest"
          [class.selected]="value() === level.value"
          [attr.aria-pressed]="value() === level.value"
          [attr.aria-label]="label() + ': ' + level.label"
          [title]="level.label"
          (click)="toggle(level.value)"
        >
          <span class="pip-text">{{ level.label }}</span>
        </button>
      }
    </div>
  `,
})
export class InterestEditorComponent {
  readonly item = input.required<InterestItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  protected readonly label = computed(() => itemLabel(this.item()));
  /** The fixed 0..3 vocabulary, translated, paired back to its values. */
  protected readonly levels = computed(() =>
    interestLevelLabels().map((label, i) => ({ value: INTEREST_LEVELS[i].value, label })),
  );

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
