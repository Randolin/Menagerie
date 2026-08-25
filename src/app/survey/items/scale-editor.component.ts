import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AnswerValue, ScaleItem } from '@moxy/core';

/** 0–6 between two anchors; clicking the selected tick clears the answer. */
@Component({
  selector: 'moxy-scale-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scale-input">
      <span class="scale-side">{{ item().left }}</span>
      <div class="pip-row" role="group"
           [attr.aria-label]="item().left + ' versus ' + item().right">
        @for (v of ticks; track v) {
          <button type="button" class="pip pip-scale" [class.selected]="value() === v"
                  [attr.aria-label]="item().left + ' to ' + item().right + ': ' + v + ' of 6'"
                  [title]="v + '/6'"
                  (click)="toggle(v)"></button>
        }
      </div>
      <span class="scale-side right">{{ item().right }}</span>
    </div>
  `,
})
export class ScaleEditorComponent {
  readonly item = input.required<ScaleItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  protected readonly ticks = [0, 1, 2, 3, 4, 5, 6];

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
