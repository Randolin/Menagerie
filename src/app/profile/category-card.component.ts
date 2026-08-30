import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { offeredItems, type Section } from '@mng/core';
import { DraftStore } from '../stores/draft.store';
import { QuestionRowComponent } from '../survey/items/question-row.component';

/**
 * One category — one card, every question in it visible at once.
 *
 * Uniform categories become a matrix. Three of the eight sections hold a
 * single item type (desires 25 × interest, seeking 16 × interest, values 10 ×
 * scale — 51 of the 88 items), so their controls take fixed-width columns that
 * line up down the whole card. That alignment is the whole trick: it is what
 * lets you read your answers as a shape rather than clicking through them one
 * question at a time.
 *
 * Mixed categories fall back to per-row controls, still in the same two-column
 * label/control grid so the card stays aligned.
 */
@Component({
  selector: 'mng-category-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuestionRowComponent],
  template: `
    <div class="card category-card">
      <div class="category-head">
        <h2>{{ section().title }}</h2>
        <span class="fine category-count">{{ answered() }} / {{ items().length }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          [attr.aria-expanded]="!collapsed()"
          (click)="collapsed.set(!collapsed())"
        >
          @if (collapsed()) {
            <span i18n>Show</span>
          } @else {
            <span i18n>Hide</span>
          }
        </button>
        <button
          i18n
          type="button"
          class="btn btn-ghost btn-small category-remove"
          (click)="confirmRemove()"
        >
          Remove
        </button>
      </div>

      @if (!collapsed()) {
        @if (section().privacy === 'match') {
          <p i18n class="fine">
            🔒 Mutual-only — these travel as scrambled fingerprints and surface only when you both
            marked the same thing. “Not for me” is never shared in any form.
          </p>
        }

        @if (removing()) {
          <div class="notice notice-warn">
            <span i18n
              ><strong>Remove “{{ section().title }}”?</strong> This clears its
              {answered(), plural,
                =1 {one answered question}
                other {{{ answered() }} answered questions}
              }
              and any importance marks.</span
            >
            <div class="btn-row" style="margin-top:8px">
              <button i18n type="button" class="btn btn-small" (click)="remove()">
                Remove and clear
              </button>
              <button
                i18n
                type="button"
                class="btn btn-ghost btn-small"
                (click)="removing.set(false)"
              >
                Keep
              </button>
            </div>
          </div>
        }

        <!--
          No column header: every pip carries its own label, so a header row
          would say the same four words a second time on every row — 100
          redundant labels on a 25-question category — and would scroll out of
          sight long before the rows it explains ran out.
        -->
        <div class="q-table" [class.q-interest]="isInterest()" [class.q-scale]="isScale()">
          @for (item of items(); track item.id) {
            <mng-question-row [item]="item" />
          }
        </div>
      }
    </div>
  `,
})
export class CategoryCardComponent {
  readonly section = input.required<Section>();
  private readonly draft = inject(DraftStore);

  protected readonly collapsed = signal(false);
  protected readonly removing = signal(false);

  /** Gated depth questions stay out until earlier answers ask for them. */
  protected readonly items = computed(() => offeredItems(this.section(), this.draft.answers()));

  protected readonly answered = computed(() => this.draft.answeredIn(this.section()));

  protected readonly isInterest = computed(() => this.items().every((i) => i.type === 'interest'));
  protected readonly isScale = computed(() => this.items().every((i) => i.type === 'scale'));

  protected confirmRemove(): void {
    if (this.answered() === 0) this.remove();
    else this.removing.set(true);
  }

  protected remove(): void {
    this.removing.set(false);
    this.draft.removeSection(this.section());
  }
}
