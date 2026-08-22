import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { INTEREST_LEVELS, type AnswerValue, type InterestItem } from '@moxy/core';

@Component({
  selector: 'moxy-interest-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="field-label">{{ item().label }}</span>
    <div class="interest-input" role="group" [attr.aria-label]="item().label">
      @for (level of levels; track level.value) {
        <button class="opt" [attr.aria-pressed]="value() === level.value"
                (click)="toggle(level.value)">{{ level.label }}</button>
      }
    </div>
  `,
})
export class InterestEditorComponent {
  readonly item = input.required<InterestItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  protected readonly levels = INTEREST_LEVELS;

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
