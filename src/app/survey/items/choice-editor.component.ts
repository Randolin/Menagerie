import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { itemLabel, optionLabels, type AnswerValue, type ChoiceItem } from '@mng/core';
import { OptionGroupDirective } from '@mng/ui';

/** Single-select pills; clicking the selected pill clears the answer. */
@Component({
  selector: 'mng-choice-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="opt-grid" mngOptionGroup role="group" [attr.aria-label]="label()">
      @for (opt of options(); track $index) {
        <button class="opt" [attr.aria-pressed]="value() === $index" (click)="toggle($index)">
          {{ opt }}
        </button>
      }
    </div>
  `,
})
export class ChoiceEditorComponent {
  readonly item = input.required<ChoiceItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  protected readonly label = computed(() => itemLabel(this.item()));
  protected readonly options = computed(() => optionLabels(this.item()));

  protected toggle(index: number): void {
    this.valueChange.emit(this.value() === index ? undefined : index);
  }
}
