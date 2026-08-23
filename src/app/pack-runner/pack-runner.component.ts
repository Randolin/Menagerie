import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { getItem, getPack, type Item, type ItemRef } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ItemEditorComponent } from '../survey/items/item-editor.component';

/**
 * A pack, one card at a time. Single-tap answers (choice/scale/interest)
 * auto-advance; multi selects confirm with Next. Answers land in the draft
 * as they're tapped — finishing (or “Save & exit”) is the durability point
 * that encrypts and pushes, exactly like the section editor's Save.
 */
@Component({
  selector: 'moxy-pack-runner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ItemEditorComponent],
  template: `
    @if (pack(); as p) {
      <div class="card pack-card">
        <div class="pack-head">
          <a class="btn btn-ghost btn-small" routerLink="/me">← My profile</a>
          <h2>{{ p.emoji }} {{ p.title }}</h2>
          <span class="fine">{{ index() + 1 }} / {{ items().length }}</span>
        </div>
        <div class="pack-progress" role="img"
             [attr.aria-label]="answeredCount() + ' of ' + items().length + ' answered'">
          <div class="pack-progress-fill"
               [style.width.%]="(100 * (index() + 1)) / items().length"></div>
        </div>

        @if (gate(); as g) {
          <div class="optin-gate">
            <h3>This part is optional — and private by design.</h3>
            <p class="sub">
              Skip it entirely, or fill it in knowing answers only surface on a mutual
              match. “Not for me” answers are never shared in any form.
            </p>
            <div class="btn-row" style="justify-content:center">
              <button class="btn btn-primary" (click)="draft.setOptIn(g.id)">Open this pack</button>
              <a class="btn btn-ghost" routerLink="/me">Back</a>
            </div>
          </div>
        } @else if (done()) {
          <div class="pack-done">
            <h3>{{ p.emoji }} Pack complete</h3>
            <p class="sub">{{ answeredCount() }} of {{ items().length }} answered — all optional, always editable.</p>
            <div class="btn-row" style="justify-content:center">
              <button class="btn btn-primary" [disabled]="saving()" (click)="saveAndExit()">
                {{ saving() ? 'Saving…' : '💾 Save & back to my profile' }}
              </button>
              <button class="btn btn-ghost" (click)="index.set(0)">Run through again</button>
            </div>
          </div>
        } @else if (current(); as ref) {
          <div class="pack-stage">
            @if (ref.section.privacy === 'match') {
              <p class="fine">🔒 Mutual-only: revealed to a viewer only if you both marked it.</p>
            }
            <moxy-item-editor [item]="ref.item" (answered)="onAnswered($event)" />
          </div>
          <div class="btn-row pack-nav">
            <button class="btn btn-ghost btn-small" [disabled]="index() === 0"
                    (click)="go(-1)">← Back</button>
            <button class="btn btn-ghost btn-small" (click)="go(1)">
              {{ answered() ? 'Next →' : 'Skip →' }}
            </button>
            <button class="btn btn-small" style="margin-left:auto" [disabled]="saving()"
                    (click)="saveAndExit()">
              {{ saving() ? 'Saving…' : '💾 Save & exit' }}
            </button>
          </div>
        }
      </div>
    } @else {
      <div class="card">
        <h2>Unknown pack</h2>
        <a class="btn" routerLink="/me">Back to my profile</a>
      </div>
    }
  `,
  styles: `
    .pack-card { max-width: 640px; margin-inline: auto; }
    .pack-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .pack-head h2 { margin: 0; flex: 1; }
    .pack-progress {
      height: 4px; border-radius: 2px; background: var(--border);
      margin: 12px 0 4px; overflow: hidden;
    }
    .pack-progress-fill {
      height: 100%; border-radius: 2px; background: var(--accent);
      transition: width 160ms ease;
    }
    .pack-stage { margin-top: 10px; }
    .pack-nav { margin-top: 14px; }
    .pack-done { text-align: center; padding: 18px 0; }
  `,
})
export class PackRunnerComponent {
  protected readonly draft = inject(DraftStore);
  private readonly session = inject(ProfileSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.params, {
    initialValue: this.route.snapshot.params,
  });
  protected readonly pack = computed(() => getPack(String(this.params()['id'])) ?? null);
  protected readonly items = computed<ItemRef[]>(() =>
    (this.pack()?.itemIds ?? [])
      .map((id) => getItem(id))
      .filter((ref): ref is ItemRef => ref !== null),
  );

  protected readonly index = signal(0);
  protected readonly done = signal(false);
  protected readonly saving = signal(false);
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Start at the first unanswered card, so re-entering a pack resumes it.
    const firstOpen = this.items().findIndex(
      ({ item }) => this.draft.get(item.id) === undefined,
    );
    if (firstOpen === -1 && this.items().length > 0) this.done.set(true);
    else this.index.set(Math.max(0, firstOpen));
  }

  /** The gated section this pack runs into, if not yet opted in. */
  protected readonly gate = computed(() => {
    const gated = this.items().find(
      ({ section }) => section.optIn && !this.draft.isOptedIn(section),
    );
    return gated?.section ?? null;
  });

  protected readonly current = computed<ItemRef | null>(
    () => this.items()[this.index()] ?? null,
  );

  protected answered(): boolean {
    const ref = this.current();
    return ref !== null && this.draft.get(ref.item.id) !== undefined;
  }

  protected answeredCount(): number {
    return this.draft.answeredAmong(this.items().map(({ item }) => item.id));
  }

  protected onAnswered(item: Item): void {
    // Single-tap types flow to the next card; multi selects wait for Next.
    if (item.type === 'multi') return;
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = setTimeout(() => this.go(1), 220);
  }

  protected go(delta: number): void {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    const next = this.index() + delta;
    if (next >= this.items().length) this.done.set(true);
    else if (next >= 0) {
      this.done.set(false);
      this.index.set(next);
    }
  }

  protected async saveAndExit(): Promise<void> {
    this.saving.set(true);
    try {
      await this.session.save();
      if (this.session.saveState() === 'conflict') {
        this.toast.show(
          'Saved elsewhere first — this device now shows the newer copy. Re-apply your edit if it matters.',
          'error',
        );
      } else {
        this.toast.show('Saved');
        await this.router.navigate(['/me']);
      }
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
