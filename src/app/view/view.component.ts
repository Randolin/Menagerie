import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  fetchView,
  extractViewPhrase,
  hasDesiresTokens,
  importanceLabel,
  personaFromViewPhrase,
  SECTIONS,
  type AnswerValue,
  type ImportanceWeight,
  type Item,
  type Persona,
  type ProfilePayload,
  type ScaleItem,
} from '@moxy/core';
import {
  AnswerTextComponent,
  ScaleStripComponent,
  SubjectCardComponent,
  ToastService,
  errorText,
} from '@moxy/ui';
import { BoopComposerComponent } from '../boop/boop-composer.component';
import { CompareStore } from '../stores/compare.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';

interface LoadedProfile {
  readonly phrase: string;
  readonly payload: ProfilePayload;
  /** Kept from the fetch so saving this creature costs no second derivation. */
  readonly viewLocator: string;
  readonly version: number;
  readonly name: string;
  readonly persona: Persona | null;
  readonly hasDesires: boolean;
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly {
      item: Item;
      value: AnswerValue;
      weight?: ImportanceWeight;
    }[];
  }[];
}

/** What a shared view phrase, link, or scanned QR opens. */
@Component({
  selector: 'moxy-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AnswerTextComponent,
    BoopComposerComponent,
    ScaleStripComponent,
    SubjectCardComponent,
  ],
  template: `
    @if (view.error()) {
      <div class="card">
        <h2>Couldn’t open that profile</h2>
        <p class="sub">{{ errorMessage() }}</p>
        <a class="btn" routerLink="/">Go to the start</a>
      </div>
    } @else if (view.value(); as v) {
      <moxy-subject-card [persona]="v.persona" [phrase]="v.phrase" [title]="v.name + '’s profile'">
        <p class="sub">
          A Menagerie profile — anonymous by design, stored only as ciphertext the server can’t
          read.
          @if (v.hasDesires) {
            It includes a private desires section that only unlocks against a profile with mutual
            answers.
          }
        </p>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" (click)="compareWith(v)">🔍 Compare</button>
          @if (session.active()) {
            <button class="btn" (click)="saveConnection(v)">💾 Add to my menagerie</button>
          } @else {
            <button class="btn" [disabled]="hatching()" (click)="hatchAndKeep(v)">
              {{ hatching() ? 'Hatching…' : '🥚 Hatch mine and keep ' + v.name }}
            </button>
          }
        </div>
        @if (session.active()) {
          @if (v.payload.k; as reach) {
            <div style="margin-top:12px">
              <moxy-boop-composer
                [target]="reach"
                [label]="v.name"
                [emoji]="v.persona?.emoji ?? '🥚'"
              />
            </div>
          } @else {
            <p class="fine" style="margin-top:12px">
              This creature can’t be booped yet — its profile predates boops.
            </p>
          }
        }
      </moxy-subject-card>

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
              <moxy-scale-strip
                [item]="asScale(entry.item)"
                [answers]="[$any(entry.value)]"
                [names]="[v.name]"
              />
            } @else {
              <div class="grid-row">
                <div class="grid-item-label">
                  {{ $any(entry.item).label }}
                  @if (entry.weight; as w) {
                    <span class="fine" [title]="'They marked this: ' + weightLabel(w)">
                      {{ w === 3 ? '⛔' : w === 2 ? '★★' : '★' }}
                    </span>
                  }
                </div>
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

  protected readonly hatching = signal(false);

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
      const fetched = await fetchView(client, phrase);
      if (!fetched) {
        throw new Error(
          'No profile answers to that phrase. It may have been deleted, expired, or replaced by a new creature.',
        );
      }
      const payload = fetched.payload;
      const sections = SECTIONS.filter((s) => s.privacy === 'open')
        .map((s) => ({
          title: s.title,
          items: s.items
            .filter((item) => payload.a[item.id] !== undefined)
            .map((item) => ({
              item,
              value: payload.a[item.id],
              weight: payload.w?.[item.id],
            })),
        }))
        .filter((s) => s.items.length > 0);
      const persona = await personaFromViewPhrase(phrase);
      return {
        phrase,
        payload,
        viewLocator: fetched.viewLocator,
        version: fetched.version,
        name: persona?.name ?? 'Someone',
        persona,
        hasDesires: hasDesiresTokens(payload),
        sections,
      };
    },
  });

  constructor() {
    // Reading a kept creature's profile is what marks it seen — here, where
    // the answers are actually on screen, and with the version this page just
    // fetched. The page then sits still long enough for the write to land.
    effect(() => {
      // error() first: value() THROWS when the resource failed, which is why
      // the template branches on error() before it ever touches value(). An
      // effect that skips this check throws on every dead phrase and takes
      // the "couldn't open that profile" card down with it.
      if (this.view.error()) return;
      const loaded = this.view.value();
      if (!loaded) return;
      void this.session.noteProfileSeen(loaded.phrase, loaded.version).catch(() => undefined);
    });
  }

  protected errorMessage(): string {
    return errorText(this.view.error());
  }

  protected asScale(item: unknown): ScaleItem {
    return item as ScaleItem;
  }

  protected weightLabel(w: ImportanceWeight): string {
    return importanceLabel(w) ?? '';
  }

  protected compareWith(v: LoadedProfile): void {
    const mine = this.session.viewPhrase();
    if (mine) this.compare.addPhrase(mine);
    this.compare.addPhrase(v.phrase);
    void this.router.navigate(['/compare']);
  }

  protected async saveConnection(v: LoadedProfile): Promise<void> {
    try {
      await this.session.addConnection(v.name, v.phrase, {
        viewLocator: v.viewLocator,
        version: v.version,
      });
      this.toast.show(`${v.name} joined your menagerie`);
    } catch (err) {
      this.toast.error(err);
    }
  }

  /**
   * The dead end this closes: someone scans a QR, reads a profile, and the
   * only way onward is the landing page — which forgets the creature they
   * came for, at the exact moment they were most interested in it.
   *
   * A fresh profile has no answers, so there is nothing to compare yet. The
   * honest destination is the survey, with this creature already kept and
   * already queued for the comparison that becomes possible once they answer.
   */
  protected async hatchAndKeep(v: LoadedProfile): Promise<void> {
    this.hatching.set(true);
    try {
      await this.session.hatch();
      await this.session.addConnection(v.name, v.phrase, {
        viewLocator: v.viewLocator,
        version: v.version,
      });
      this.compare.addPhrase(v.phrase);
      const mine = this.session.viewPhrase();
      if (mine) this.compare.addPhrase(mine);
      await this.router.navigate(['/me']);
      this.toast.show(`Hatched — ${v.name} is in your menagerie. Answer a few, then compare.`);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.hatching.set(false);
    }
  }
}
