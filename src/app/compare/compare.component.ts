import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ToastService, seriesVar } from '@moxy/ui';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ComparePanelsComponent } from './compare-panels.component';

@Component({
  selector: 'moxy-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComparePanelsComponent],
  template: `
    <h1 i18n>Compare profiles</h1>

    <!-- The picker is a screen affordance; on paper it is a dead form. The
         panels below are the document someone actually wants to bring to a
         conversation. -->
    <div class="card no-print">
      <div class="slot-list">
        @for (slot of store.model()?.slots ?? []; track slot.ref; let i = $index) {
          <div class="slot">
            <span
              class="person-dot"
              [style.background]="slot.payload ? color(goodIndexBefore(i)) : 'var(--baseline)'"
            ></span>
            @if (slotEmoji(i); as emoji) {
              <span aria-hidden="true">{{ emoji }}</span>
            }
            <span class="person-name">{{ slotName(i) }}</span>
            @if (slot.error) {
              <span class="fine">{{ slot.error }}</span>
            }
            <span class="slot-meta">{{ slot.ref }}</span>
            <button
              class="btn btn-ghost btn-small"
              [attr.aria-label]="'Remove ' + slotName(i)"
              (click)="store.remove(i)"
            >
              ✕
            </button>
          </div>
        }
      </div>

      <form
        style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"
        (submit)="paste($event, pasteInput)"
      >
        <div style="flex:1;min-width:220px">
          <input
            #pasteInput
            type="text"
            i18n-placeholder
            placeholder="Paste a view phrase or link…"
            i18n-aria-label
            aria-label="Paste a view phrase or link"
          />
        </div>
        <button i18n class="btn" [disabled]="store.full">Add</button>
      </form>

      <div class="btn-row" style="margin-top:12px">
        @if (canAddMine()) {
          <button i18n class="btn btn-small" (click)="addMine()">＋ My profile</button>
        }
        @for (c of session.connections(); track c.id) {
          @if (!store.full) {
            <button class="btn btn-small" (click)="addPhrase(c.viewPhrase)">
              ＋ {{ c.label }}
            </button>
          }
        }
        @if (store.entries().length >= 1) {
          <button i18n class="btn btn-ghost btn-small" (click)="store.clear()">Clear all</button>
        }
      </div>
      <p i18n class="fine" style="margin-top:10px">
        Comparisons happen entirely in this tab and vanish when you leave — the server only ever
        sees encrypted lookups.
      </p>
    </div>

    @if (store.model(); as m) {
      @if (m.payloads.length >= 2) {
        <moxy-compare-panels [model]="m" />
      } @else {
        <div class="card">
          <p i18n class="sub">
            Add at least two profiles to see the comparison — your own, people you’ve saved, or any
            view phrase you’ve been given.
          </p>
        </div>
      }
    }
  `,
})
export class CompareComponent {
  protected readonly store = inject(CompareStore);
  protected readonly session = inject(ProfileSessionStore);
  private readonly toast = inject(ToastService);
  protected readonly color = seriesVar;

  protected readonly canAddMine = computed(() => {
    const mine = this.session.viewPhrase();
    return (
      Boolean(mine) &&
      !this.store.full &&
      !this.store.entries().some((e) => e.kind === 'phrase' && e.phrase === mine)
    );
  });

  protected slotName(slotIndex: number): string {
    const m = this.store.model();
    if (!m) return '…';
    const slot = m.slots[slotIndex];
    if (!slot?.payload) return 'Unreadable profile';
    return m.names[this.goodIndexBefore(slotIndex)] ?? '…';
  }

  protected slotEmoji(slotIndex: number): string | null {
    const m = this.store.model();
    if (!m || !m.slots[slotIndex]?.payload) return null;
    return m.emojis[this.goodIndexBefore(slotIndex)] ?? null;
  }

  /** Index of this slot among the successfully loaded ones (drives its color). */
  protected goodIndexBefore(slotIndex: number): number {
    const m = this.store.model();
    if (!m) return 0;
    let n = 0;
    for (let i = 0; i < slotIndex; i++) if (m.slots[i]?.payload) n++;
    return n;
  }

  protected paste(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    try {
      if (!this.store.addFromText(input.value)) {
        this.toast.show($localize`That profile is already here`);
        return;
      }
      input.value = '';
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected addMine(): void {
    const mine = this.session.viewPhrase();
    if (mine && !this.store.addPhrase(mine))
      this.toast.show($localize`That profile is already here`);
  }

  protected addPhrase(phrase: string): void {
    if (!this.store.addPhrase(phrase)) this.toast.show($localize`That profile is already here`);
  }
}
