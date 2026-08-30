import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SCALE_MAX, scaleEnds, type AnswerValue, type ScaleItem } from '@mng/core';
import { OptionGroupDirective } from '@mng/ui';

/** 0–SCALE_MAX between two anchors; clicking the selected tick clears the answer. */
@Component({
  selector: 'mng-scale-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <div class="scale-input">
      <span class="scale-side">{{ ends()[0] }}</span>
      <div class="pip-row" mngOptionGroup role="group" [attr.aria-label]="groupLabel()">
        @for (v of ticks; track v) {
          <button
            type="button"
            class="pip pip-scale"
            [class.selected]="value() === v"
            [attr.aria-label]="tickLabel(v)"
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

  /**
   * The only labels a screen reader gets for a row of unlabelled pips — so
   * they are copy, and copy in a binding has no `i18n-` form.
   */
  protected readonly groupLabel = computed(
    () => $localize`${this.ends()[0]}:LEFT: versus ${this.ends()[1]}:RIGHT:`,
  );

  protected tickLabel(v: number): string {
    return $localize`${this.ends()[0]}:LEFT: to ${this.ends()[1]}:RIGHT:: ${v}:VALUE: of ${this.max}:MAX:`;
  }

  protected toggle(v: number): void {
    this.valueChange.emit(this.value() === v ? undefined : v);
  }
}
