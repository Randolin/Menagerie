import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  decryptBlob,
  deriveViewKeys,
  displayName,
  extractViewPhrase,
  hasDesiresTokens,
  migrateToCurrent,
  personaFromViewPhrase,
  SECTIONS,
  type AnswerValue,
  type Item,
  type Persona,
  type ProfilePayload,
  type ScaleItem,
} from '@moxy/core';
import {
  AnswerTextComponent,
  PersonaChipComponent,
  ScaleStripComponent,
  ToastService,
} from '@moxy/ui';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';

interface LoadedProfile {
  readonly phrase: string;
  readonly payload: ProfilePayload;
  readonly name: string;
  readonly persona: Persona | null;
  readonly hasDesires: boolean;
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly { item: Item; value: AnswerValue }[];
  }[];
}

/** What a shared view phrase, link, or scanned QR opens. */
@Component({
  selector: 'moxy-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AnswerTextComponent, PersonaChipComponent, ScaleStripComponent],
  template: `
    @if (view.error()) {
      <div class="card">
        <h2>Couldn’t open that profile</h2>
        <p class="sub">{{ errorMessage() }}</p>
        <a class="btn" routerLink="/">Go to the start</a>
      </div>
    } @else if (view.value(); as v) {
      <div class="card">
        <h2 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          {{ v.name }}’s profile
          @if (v.persona; as persona) { <moxy-persona-chip [persona]="persona" /> }
        </h2>
        <p class="sub">
          A Menagerie profile — anonymous by design, stored only as ciphertext the server
          can’t read.
          @if (v.hasDesires) {
            It includes a private desires section that only unlocks against a profile
            with mutual answers.
          }
        </p>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" (click)="compareWith(v)">🔍 Compare</button>
          @if (session.active()) {
            <button class="btn" (click)="saveConnection(v)">💾 Add to my menagerie</button>
          } @else {
            <a class="btn btn-ghost" routerLink="/">Hatch your own creature to compare</a>
          }
        </div>
      </div>

      @if (v.sections.length === 0) {
        <div class="card">
          <p class="sub">Nothing here yet — this profile hasn’t saved any open answers.</p>
        </div>
      }
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
    } @else {
      <div class="card"><p class="sub">Opening profile…</p></div>
    }
  `,
})
export class ViewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly config = inject(ServerConfigStore);
  private readonly compare = inject(CompareStore);
  protected readonly session = inject(ProfileSessionStore);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.params, {
    initialValue: this.route.snapshot.params,
  });
  private readonly phrase = computed(() => String(this.params()['phrase'] ?? ''));

  protected readonly view = resource({
    params: () => ({ phrase: this.phrase(), state: this.config.state() }),
    loader: async ({ params }): Promise<LoadedProfile> => {
      if (params.state === 'loading') return new Promise<never>(() => undefined);
      if (params.state === 'unconfigured') {
        throw new Error('No profile server is configured, so nothing can be looked up.');
      }
      const phrase = extractViewPhrase(params.phrase);
      if (!phrase) throw new Error('That’s not a valid Menagerie view phrase.');
      const client = this.config.client();
      if (!client) throw new Error('No profile server is configured.');
      const { viewLocator, viewKey } = await deriveViewKeys(phrase);
      const record = await client.getView(viewLocator);
      if (!record) {
        throw new Error(
          'No profile answers to that phrase. It may have been deleted, expired, or replaced by a new creature.',
        );
      }
      const payload = migrateToCurrent(await decryptBlob(record.blob_view, viewKey));
      const sections = SECTIONS.filter((s) => s.privacy === 'open')
        .map((s) => ({
          title: s.title,
          items: s.items
            .filter((item) => payload.a[item.id] !== undefined)
            .map((item) => ({ item, value: payload.a[item.id] })),
        }))
        .filter((s) => s.items.length > 0);
      return {
        phrase,
        payload,
        name: displayName(payload, 'Someone'),
        persona: await personaFromViewPhrase(phrase),
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

  protected compareWith(v: LoadedProfile): void {
    const mine = this.session.viewPhrase();
    if (mine) this.compare.addPhrase(mine);
    this.compare.addPhrase(v.phrase);
    void this.router.navigate(['/compare']);
  }

  protected async saveConnection(v: LoadedProfile): Promise<void> {
    try {
      await this.session.addConnection(v.name, v.phrase);
      this.toast.show(`${v.name} joined your menagerie`);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }
}
