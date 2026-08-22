import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Type,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService, copyText, seriesVar } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { VaultStore } from '../stores/vault.store';
import { CompareStore } from '../stores/compare.store';
import { ShareLinkService } from '../share-link.service';
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
        @for (slot of store.model()?.slots ?? []; track slot.code; let i = $index) {
          <div class="slot">
            <span class="person-dot"
                  [style.background]="slot.payload ? color(goodIndexBefore(i)) : 'var(--baseline)'"></span>
            <span class="person-name">{{ slotName(i) }}</span>
            @if (slot.error) { <span class="fine">{{ slot.error }}</span> }
            <span class="slot-meta">{{ slot.code.length }} chars</span>
            <button class="btn btn-ghost btn-small" [attr.aria-label]="'Remove ' + slotName(i)"
                    (click)="store.remove(i)">✕</button>
          </div>
        }
      </div>

      <form style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"
            (submit)="paste($event, pasteInput)">
        <div style="flex:1;min-width:220px">
          <input #pasteInput type="text" placeholder="Paste a profile link or code…"
                 aria-label="Paste a profile link">
        </div>
        <button class="btn" [disabled]="store.full">Add</button>
      </form>

      <div class="btn-row" style="margin-top:12px">
        @if (draft.hasAnswers() && !store.full) {
          <button class="btn btn-small" (click)="addMine()">＋ My current profile</button>
        }
        @if (vault.unlocked() && !store.full) {
          @for (p of vault.profiles(); track p.id) {
            <button class="btn btn-small" (click)="addVaultProfile(p.id)">
              ＋ {{ p.label }} (vault)
            </button>
          }
          @for (c of vault.connections(); track c.id) {
            <button class="btn btn-small" (click)="addConnection(c.id)">
              ＋ {{ c.label }} (saved)
            </button>
          }
        }
        @if (store.codes().length >= 2) {
          <button class="btn btn-ghost btn-small" (click)="copyCompareLink()">
            🔗 Copy a link to this comparison
          </button>
          <button class="btn btn-ghost btn-small" (click)="store.clear()">Clear all</button>
        }
      </div>
    </div>

    @if (store.model(); as m) {
      @if (m.payloads.length >= 2) {
        @for (panel of visiblePanels(); track panel.descriptor.id) {
          <ng-container *ngComponentOutlet="panel.component; inputs: { model: m }" />
        }
      } @else {
        <div class="card">
          <p class="sub">
            Add at least two profiles to see the comparison. Add your own from the survey,
            paste links you’ve been sent, or pull saved connections from your vault.
          </p>
        </div>
      }
    }
  `,
})
export class CompareComponent {
  protected readonly store = inject(CompareStore);
  protected readonly draft = inject(DraftStore);
  protected readonly vault = inject(VaultStore);
  private readonly shareLink = inject(ShareLinkService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly color = seriesVar;

  private readonly resolved = signal<readonly ResolvedPanel[]>([]);

  protected readonly visiblePanels = computed(() => {
    const m = this.store.model();
    if (!m) return [];
    return this.resolved().filter(
      (p) => !p.descriptor.visible || p.descriptor.visible(m),
    );
  });

  constructor() {
    // Ingest a legacy #c=a~b link, then normalize the URL (mirrors legacy behavior).
    const codesParam = this.route.snapshot.params['codes'];
    if (typeof codesParam === 'string' && codesParam) {
      for (const code of codesParam.split('~')) {
        if (code) this.store.addCode(code);
      }
      void this.router.navigate(['/compare'], { replaceUrl: true });
    }

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

  /** Index of this slot among the successfully decoded ones (drives its color). */
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
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async addMine(): Promise<void> {
    const { code } = await this.shareLink.encode(this.draft.answers());
    if (!this.store.addCode(code)) this.toast.show('That profile is already here');
  }

  protected async addVaultProfile(id: string): Promise<void> {
    const p = this.vault.profiles().find((x) => x.id === id);
    if (!p) return;
    const { code } = await this.shareLink.encode(p.answers);
    if (!this.store.addCode(code)) this.toast.show('That profile is already here');
  }

  protected addConnection(id: string): void {
    const c = this.vault.connections().find((x) => x.id === id);
    if (!c) return;
    try {
      this.store.addFromText(c.code);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async copyCompareLink(): Promise<void> {
    this.toast.show(
      (await copyText(this.store.compareUrl())) ? 'Compare link copied' : 'Copy failed',
    );
  }
}
