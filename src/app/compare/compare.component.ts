import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Type,
} from '@angular/core';
import { ToastService, seriesVar } from '@moxy/ui';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import {
  COMPARE_PANELS,
  type ComparePanelComponent,
  type ComparePanelDescriptor,
} from './compare-panels.token';

interface ResolvedPanel {
  readonly descriptor: ComparePanelDescriptor;
  readonly component: Type<ComparePanelComponent>;
}

@Component({
  selector: 'moxy-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    <h1>Compare profiles</h1>

    <div class="card">
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
            placeholder="Paste a view phrase or link…"
            aria-label="Paste a view phrase or link"
          />
        </div>
        <button class="btn" [disabled]="store.full">Add</button>
      </form>

      <div class="btn-row" style="margin-top:12px">
        @if (canAddMine()) {
          <button class="btn btn-small" (click)="addMine()">＋ My profile</button>
        }
        @for (c of session.connections(); track c.id) {
          @if (!store.full) {
            <button class="btn btn-small" (click)="addPhrase(c.viewPhrase)">
              ＋ {{ c.label }}
            </button>
          }
        }
        @if (store.entries().length >= 1) {
          <button class="btn btn-ghost btn-small" (click)="store.clear()">Clear all</button>
        }
      </div>
      <p class="fine" style="margin-top:10px">
        Comparisons happen entirely in this tab and vanish when you leave — the server only ever
        sees encrypted lookups.
      </p>
    </div>

    @if (store.model(); as m) {
      @if (m.payloads.length >= 2) {
        @for (panel of visiblePanels(); track panel.descriptor.id) {
          <ng-container *ngComponentOutlet="panel.component; inputs: { model: m }" />
        }
      } @else {
        <div class="card">
          <p class="sub">
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

  private readonly resolved = signal<readonly ResolvedPanel[]>([]);

  protected readonly visiblePanels = computed(() => {
    const m = this.store.model();
    if (!m) return [];
    return this.resolved().filter((p) => !p.descriptor.visible || p.descriptor.visible(m));
  });

  protected readonly canAddMine = computed(() => {
    const mine = this.session.viewPhrase();
    return (
      Boolean(mine) &&
      !this.store.full &&
      !this.store.entries().some((e) => e.kind === 'phrase' && e.phrase === mine)
    );
  });

  constructor() {
    const descriptors = [...(inject(COMPARE_PANELS, { optional: true }) ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    void Promise.all(
      descriptors.map(async (descriptor) => ({
        descriptor,
        component: await descriptor.loadComponent(),
      })),
    ).then((panels) => this.resolved.set(panels));
  }

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
        this.toast.show('That profile is already here');
        return;
      }
      input.value = '';
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected addMine(): void {
    const mine = this.session.viewPhrase();
    if (mine && !this.store.addPhrase(mine)) this.toast.show('That profile is already here');
  }

  protected addPhrase(phrase: string): void {
    if (!this.store.addPhrase(phrase)) this.toast.show('That profile is already here');
  }
}
