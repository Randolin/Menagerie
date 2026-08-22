import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AnswerValue, MultiItem } from '@moxy/core';

@Component({
  selector: 'moxy-multi-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="field-label">{{ item().label }}</span>
    <div class="opt-grid" role="group" [attr.aria-label]="item().label">
      @for (opt of item().options; track $index) {
        <button class="opt" [attr.aria-pressed]="selected().has($index)"
                (click)="toggle($index)">{{ opt }}</button>
      }
    </div>
  `,
})
export class MultiEditorComponent {
  readonly item = input.required<MultiItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();

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
