import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SECTIONS, sectionBlurb, sectionTitle, type Section } from '@mng/core';
import { DraftStore } from '../stores/draft.store';

/**
 * The one control on an empty profile: add a category.
 *
 * It offers only what is MISSING — the menu shrinks as the profile fills, and
 * disappears entirely once everything is on the page. Nothing here navigates;
 * choosing a category drops its card onto the page below, so the profile is
 * only ever one screen.
 */
@Component({
  selector: 'mng-add-category',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing().length) {
      <div class="card add-card">
        @if (!open()) {
          <button i18n type="button" class="btn btn-primary add-trigger" (click)="open.set(true)">
            ＋ Add a category
          </button>
          <span i18n class="fine">{{ missing().length }} left to add — all optional</span>
        } @else {
          <div class="add-head">
            <h2 i18n>Add a category</h2>
            <button i18n type="button" class="btn btn-ghost btn-small" (click)="open.set(false)">
              Cancel
            </button>
          </div>
          <div class="add-grid">
            @for (s of missing(); track s.section.id) {
              <button type="button" class="add-option" (click)="add(s.section)">
                <span class="add-option-title">
                  {{ s.title }}
                  @if (s.section.privacy === 'match') {
                    <span i18n class="fine">🔒 mutual-only</span>
                  }
                </span>
                <span class="fine add-option-blurb">{{ s.blurb }}</span>
                <span i18n class="fine">{{ s.section.items.length }} questions</span>
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class AddCategoryComponent {
  private readonly draft = inject(DraftStore);
  protected readonly open = signal(false);

  /** Titles and blurbs come through the message layer, never off the schema. */
  protected readonly missing = computed(() =>
    SECTIONS.filter((s) => !this.draft.isAdded(s)).map((section) => ({
      section,
      title: sectionTitle(section),
      blurb: sectionBlurb(section),
    })),
  );

  protected add(section: Section): void {
    this.draft.addSection(section.id);
    // Opting in is implied by choosing a gated category from a menu that
    // already labels it mutual-only — a second confirmation screen would be
    // the kind of click-through this redesign exists to remove.
    if (section.optIn) this.draft.setOptIn(section.id);
    this.open.set(false);
  }
}
