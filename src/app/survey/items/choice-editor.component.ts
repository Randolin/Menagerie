import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AnswerValue, ChoiceItem } from '@moxy/core';

/** Single-select pills; clicking the selected pill clears the answer. */
@Component({
  selector: 'moxy-choice-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="opt-grid" role="group" [attr.aria-label]="item().label">
      @for (opt of item().options; track $index) {
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

  protected toggle(index: number): void {
    this.valueChange.emit(this.value() === index ? undefined : index);
  }
}
