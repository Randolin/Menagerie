import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { itemLabel, optionLabels, type AnswerValue, type MultiItem } from '@mng/core';
import { OptionGroupDirective } from '@mng/ui';

@Component({
  selector: 'mng-multi-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="opt-grid" mngOptionGroup role="group" [attr.aria-label]="label()">
      @for (opt of options(); track $index) {
        <button class="opt" [attr.aria-pressed]="selected().has($index)" (click)="toggle($index)">
          {{ opt }}
        </button>
      }
    </div>
  `,
})
export class MultiEditorComponent {
  readonly item = input.required<MultiItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  protected readonly label = computed(() => itemLabel(this.item()));
  protected readonly options = computed(() => optionLabels(this.item()));

  protected readonly selected = computed(() => {
    const v = this.value();
    return new Set(Array.isArray(v) ? v : []);
  });

  protected toggle(index: number): void {
    const next = new Set(this.selected());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    const list = [...next].sort((a, b) => a - b);
    this.valueChange.emit(list.length ? list : undefined);
  }
}
