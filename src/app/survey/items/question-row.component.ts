import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IMPORTANCE_WEIGHTS, type Item } from '@moxy/core';
import { DraftStore } from '../../stores/draft.store';
import { ItemEditorComponent } from './item-editor.component';
import { WeightControlComponent } from './weight-control.component';

/**
 * One question as a row: label on the left, controls on the right, aligned
 * with its neighbours so a category reads as a table you can scan — the thing
 * that made the old kink-list surveys workable and that per-question cards
 * destroyed.
 *
 * Importance is on demand. It's a real feature, but a weight control under
 * every answered row roughly doubles the height of a 25-row category and
 * buries the answers. So an answered row grows one small marker: unset it is a
 * quiet outline that only reads as "you could mark this"; set it shows the
 * mark itself. Expanding is per-row and keyboard reachable.
 */
@Component({
  selector: 'moxy-question-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemEditorComponent, WeightControlComponent],
  template: `
    <div class="q-row" [class.answered]="answered()" [class.is-scale]="isScale()">
      <div class="q-label">
        <span class="q-text">{{ label() }}</span>
        @if (answered()) {
          <button
            type="button"
            class="q-mark"
            [class.on]="weight()"
            [attr.aria-expanded]="open()"
            [attr.aria-label]="markLabel()"
            [title]="markLabel()"
            (click)="open.set(!open())"
          >{{ markGlyph() }}</button>
        }
      </div>
      <div class="q-control">
        <moxy-item-editor [item]="item()" />
      </div>
      @if (open() && answered()) {
        <div class="q-weight">
          <moxy-weight-control [item]="item()" />
        </div>
      }
    </div>
  `,
})
export class QuestionRowComponent {
  readonly item = input.required<Item>();
  private readonly draft = inject(DraftStore);
  protected readonly open = signal(false);

  protected readonly isScale = computed(() => this.item().type === 'scale');

  /**
   * A scale states itself through its two anchors, which the control already
   * renders — so the label is kept for assistive tech and hidden visually
   * (`.is-scale .q-text`) rather than printed twice beside the pips.
   */
  protected readonly label = computed(() => {
    const i = this.item();
    return i.type === 'scale' ? `${i.left} → ${i.right}` : i.label;
  });

  protected readonly answered = computed(() => {
    const v = this.draft.answers()[this.item().id];
    return v !== undefined && !(Array.isArray(v) && v.length === 0);
  });

  protected readonly weight = computed(() => this.draft.weights()[this.item().id]);

  protected readonly markGlyph = computed(() => {
    const w = this.weight();
    return w === 3 ? '⛔' : w === 2 ? '★' : w === 1 ? '☆' : '·';
  });

  protected readonly markLabel = computed(() => {
    const w = this.weight();
    const def = IMPORTANCE_WEIGHTS.find((d) => d.value === w);
    return def ? `Importance: ${def.label}` : 'Set importance';
  });
}
