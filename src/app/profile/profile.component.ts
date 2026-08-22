import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  decodePayload,
  displayName,
  hasDesiresTokens,
  SECTIONS,
  type AnswerValue,
  type Item,
  type ProfilePayload,
  type ScaleItem,
} from '@moxy/core';
import { AnswerTextComponent, ScaleStripComponent, ToastService } from '@moxy/ui';
import { CompareStore } from '../stores/compare.store';
import { VaultStore } from '../stores/vault.store';

interface ProfileView {
  readonly payload: ProfilePayload;
  readonly name: string;
  readonly hasDesires: boolean;
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly { item: Item; value: AnswerValue }[];
  }[];
}

/** Single-profile view — what opening someone's shared #p= link shows. */
@Component({
  selector: 'moxy-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AnswerTextComponent, ScaleStripComponent],
  template: `
    @if (view.error()) {
      <div class="card">
        <h2>Couldn’t read that profile</h2>
        <p class="sub">{{ errorMessage() }}</p>
        <a class="btn" routerLink="/home">Go home</a>
      </div>
    } @else if (view.value(); as v) {
      <div class="card">
        <h2>{{ v.name }}’s profile</h2>
        <p class="sub">
          This is a Moxy profile — shared with you as a link, stored on no server.
          @if (v.hasDesires) {
            It includes a private desires section that only unlocks against a profile with
            mutual answers.
          }
        </p>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" (click)="compareWith()">🔍 Compare with a profile</button>
          @if (vault.unlocked()) {
            <button class="btn" (click)="saveToVault(v)">💾 Save to vault</button>
          } @else {
            <a class="btn btn-ghost" routerLink="/vault">Unlock vault to save them</a>
          }
        </div>
      </div>

      @for (section of v.sections; track section.title) {
        <div class="card grid-section">
          <h2>{{ section.title }}</h2>
          @for (entry of section.items; track entry.item.id) {
            @if (entry.item.type === 'scale') {
              <moxy-scale-strip [item]="asScale(entry.item)" [answers]="[$any(entry.value)]"
                                [names]="[v.name]" />
            } @else {
              <div class="grid-row">
                <div class="grid-item-label">{{ $any(entry.item).label }}</div>
                <div class="grid-answers">
                  <moxy-answer-text [item]="entry.item" [value]="$any(entry.value)" />
                </div>
              </div>
            }
          }
        </div>
      }
    }
  `,
})
export class ProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly compare = inject(CompareStore);
  protected readonly vault = inject(VaultStore);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.params, { initialValue: this.route.snapshot.params });
  protected readonly code = computed(() => String(this.params()['code'] ?? ''));

  protected readonly view = resource({
    params: () => this.code(),
    loader: async ({ params }): Promise<ProfileView> => {
      const payload = await decodePayload(params);
      const sections = SECTIONS.filter((s) => s.privacy === 'open')
        .map((s) => ({
          title: s.title,
          items: s.items
            .filter((item) => payload.a[item.id] !== undefined)
            .map((item) => ({ item, value: payload.a[item.id] })),
        }))
        .filter((s) => s.items.length > 0);
      return {
        payload,
        name: displayName(payload, 'Someone'),
        hasDesires: hasDesiresTokens(payload),
        sections,
      };
    },
  });

  protected errorMessage(): string {
    const err = this.view.error();
    return err instanceof Error ? err.message : String(err ?? 'Unknown error');
  }

  protected asScale(item: unknown): ScaleItem {
    return item as ScaleItem;
  }

  protected compareWith(): void {
    this.compare.addCode(this.code());
    void this.router.navigate(['/compare']);
  }

  protected async saveToVault(v: ProfileView): Promise<void> {
    await this.vault.saveConnection(v.name, this.code());
    this.toast.show(`Saved ${v.name} to your vault`);
  }
}
