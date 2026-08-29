import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  IMPORTANCE_WEIGHTS,
  importanceLabels,
  interestLevelLabels,
  optionLabels,
  itemLabel,
  type ImportanceWeight,
  type Item,
} from '@moxy/core';
import { OptionGroupDirective } from '@moxy/ui';
import { DraftStore } from '../../stores/draft.store';

/**
 * The importance row under an answered item in the review forms: how much
 * this dimension matters when scoring someone against you. "Dealbreaker"
 * additionally asks which of the other person's answers you could live with;
 * scales stop at "matters a lot" (there is no acceptable-set for a slider).
 */
@Component({
  selector: 'moxy-weight-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionGroupDirective],
  template: `
    <!-- aria-pressed, not just a class: which importance is set was visible
         only as a highlight, so a screen reader could not tell at all. -->
    <div class="weight-row" moxyOptionGroup role="group" [attr.aria-label]="importanceLabel()">
      <span class="fine">Importance:</span>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        [class.weight-on]="!weight()"
        [attr.aria-pressed]="!weight()"
        (click)="setWeight(undefined)"
      >
        Default
      </button>
      @for (def of tiers(); track def.value) {
        <button
          type="button"
          class="btn btn-ghost btn-small"
          [class.weight-on]="weight() === def.value"
          [attr.aria-pressed]="weight() === def.value"
          (click)="setWeight(def.value)"
        >
          {{ def.value === 3 ? '⛔ ' + def.label : def.label }}
        </button>
      }
    </div>
    @if (weight() === 3) {
      <div class="weight-accept" moxyOptionGroup role="group" [attr.aria-label]="acceptLabel()">
        <span class="fine">I could match with:</span>
        @for (opt of acceptOptions(); track $index) {
          <button
            type="button"
            class="opt"
            [class.selected]="isAcceptable($index)"
            [attr.aria-pressed]="isAcceptable($index)"
            (click)="toggleAcceptable($index)"
          >
            {{ opt }}
          </button>
        }
        @if (!hasAcceptable()) {
          <span class="fine">— pick at least one, or this stays a soft weight</span>
        }
      </div>
    }
  `,
  styles: `
    .weight-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .weight-on {
      border-color: var(--accent);
      color: var(--accent);
    }
    .weight-accept {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
  `,
})
export class WeightControlComponent {
  readonly item = input.required<Item>();
  private readonly draft = inject(DraftStore);

  /** Names the group, so the row is not an unlabelled cluster of buttons. */
  protected readonly importanceLabel = computed(() => `Importance: ${itemLabel(this.item())}`);
  protected readonly acceptLabel = computed(
    () => `Answers I could match with: ${itemLabel(this.item())}`,
  );

  protected readonly weight = computed(() => this.draft.weights()[this.item().id]);

  protected readonly tiers = computed(() => {
    const named = importanceLabels().map((label, i) => ({
      value: IMPORTANCE_WEIGHTS[i].value,
      label,
    }));
    return this.item().type === 'scale' ? named.filter((d) => d.value !== 3) : named;
  });

  protected readonly acceptOptions = computed<readonly string[]>(() => {
    const item = this.item();
    if (item.type === 'choice' || item.type === 'multi') return optionLabels(item);
    if (item.type === 'interest') return interestLevelLabels();
    return [];
  });

  protected setWeight(w: ImportanceWeight | undefined): void {
    this.draft.setWeight(this.item().id, w);
  }

  protected isAcceptable(index: number): boolean {
    return (this.draft.acceptable()[this.item().id] ?? []).includes(index);
  }

  protected hasAcceptable(): boolean {
    return (this.draft.acceptable()[this.item().id] ?? []).length > 0;
  }

  protected toggleAcceptable(index: number): void {
    const id = this.item().id;
    const current = this.draft.acceptable()[id] ?? [];
    const next = current.includes(index)
      ? current.filter((i) => i !== index)
      : [...current, index].sort((a, b) => a - b);
    this.draft.setAcceptable(id, next);
  }
}
