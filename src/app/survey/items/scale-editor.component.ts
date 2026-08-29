import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SCALE_MAX, scaleEnds, type AnswerValue, type ScaleItem } from '@moxy/core';
import { OptionGroupDirective } from '@moxy/ui';

/** 0–SCALE_MAX between two anchors; clicking the selected tick clears the answer. */
@Component({
  selector: 'moxy-scale-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="scale-input">
      <span class="scale-side">{{ ends()[0] }}</span>
      <div
        class="pip-row"
        moxyOptionGroup
        role="group"
        [attr.aria-label]="ends()[0] + ' versus ' + ends()[1]"
      >
        @for (v of ticks; track v) {
          <button
            type="button"
            class="pip pip-scale"
            [class.selected]="value() === v"
            [attr.aria-label]="ends()[0] + ' to ' + ends()[1] + ': ' + v + ' of ' + max"
            [title]="v + '/' + max"
            (click)="toggle(v)"
          ></button>
        }
      </div>
      <span class="scale-side right">{{ ends()[1] }}</span>
    </div>
  `,
})
export class ScaleEditorComponent {
  readonly item = input.required<ScaleItem>();
  readonly value = input.required<AnswerValue | undefined>();
  readonly valueChange = output<AnswerValue | undefined>();
  /** Both anchors, translated. Never read `item().left` in a template. */
  protected readonly ends = computed(() => scaleEnds(this.item())!);
  protected readonly max = SCALE_MAX;
  protected readonly ticks = Array.from({ length: SCALE_MAX + 1 }, (_, v) => v);

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
