import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { itemLabel, optionLabels, type AnswerValue, type ChoiceItem } from '@moxy/core';
import { OptionGroupDirective } from '@moxy/ui';

/** Single-select pills; clicking the selected pill clears the answer. */
@Component({
  selector: 'moxy-choice-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="opt-grid" moxyOptionGroup role="group" [attr.aria-label]="label()">
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
