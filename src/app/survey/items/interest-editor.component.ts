import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { INTEREST_LEVELS, type AnswerValue, type InterestItem } from '@moxy/core';

@Component({
  selector: 'moxy-interest-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pip-row" role="group" [attr.aria-label]="item().label">
      @for (level of levels; track level.value) {
        <button type="button" class="pip pip-interest"
                [class.selected]="value() === level.value"
                [attr.aria-pressed]="value() === level.value"
                [attr.aria-label]="item().label + ': ' + level.label"
                [title]="level.label"
                (click)="toggle(level.value)">
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
  protected readonly levels = INTEREST_LEVELS;

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
