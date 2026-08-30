import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { buildDemoCast, personaFromViewPhrase } from '@mng/core';
import { CreatureAvatarComponent, ToastService } from '@mng/ui';
import { buildCompareModel, type CompareSlot } from '../compare/compare-model';
import { ComparePanelsComponent } from '../compare/compare-panels.component';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';

/**
 * What a comparison looks like, before you have one.
 *
 * Everything else here needs two finished profiles and a reachable server
 * before it shows anything at all, which asks a newcomer to spend twenty
 * minutes on faith. This renders the real panels, with real scoring, against
 * a fictional pair — no network, no session, nothing stored.
 */
@Component({
  selector: 'mng-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ComparePanelsComponent, CreatureAvatarComponent],
  template: `
    <div class="hero">
      <h1 i18n>What a comparison looks like</h1>
      <p i18n class="lede">
        Two profiles that don’t exist, compared for real. Every number below is computed by the same
        code your own comparisons use — nothing here is a screenshot, and nothing here is stored or
        sent anywhere.
      </p>
    </div>

    <!-- error() before value(): a resource throws from value() when it failed. -->
    @if (demo.error()) {
      <div class="card">
        <h2 i18n>The demo didn’t build</h2>
        <p i18n class="sub">That’s a bug in Menagerie, not in anything you did.</p>
        <a i18n class="btn" routerLink="/">Go to the start</a>
      </div>
    } @else if (demo.value(); as model) {
      <div class="card">
        <div class="btn-row" style="align-items:center;gap:14px;flex-wrap:wrap">
          @for (persona of personas(); track persona.name) {
            <span style="display:inline-flex;align-items:center;gap:8px">
              <mng-creature-avatar [persona]="persona" [size]="34" />
              <strong>{{ persona.name }}</strong>
            </span>
          }
        </div>
        <p i18n class="fine" style="margin-top:10px">
          Invented for this page. They have opposite ideas about drinking, and one of them made that
          a dealbreaker — which is the kind of thing worth knowing early, and the kind of thing this
          survey exists to surface.
        </p>
      </div>

      <mng-compare-panels [model]="model" />

      <div class="card">
        <h2 i18n>Your turn</h2>
        <p i18n class="sub">
          Hatching takes a second and needs no account, no email, and no name. Answer the core set —
          about five minutes — share your phrase with one person, and you get this, about the two of
          you.
        </p>
        @if (ready()) {
          <button class="btn btn-primary" [disabled]="hatching()" (click)="hatch()">
            @if (hatching()) {
              <span i18n>Hatching…</span>
            } @else {
              <span i18n>🥚 Hatch my creature</span>
            }
          </button>
        } @else {
          <!-- This page works with no server; hatching does not. -->
          <a i18n class="btn btn-primary" routerLink="/">Get started</a>
          <p i18n class="fine" style="margin-top:8px">
            No profile server is configured yet, so this demo is all there is to see for now.
          </p>
        }
      </div>
    } @else {
      <div class="card"><p i18n class="sub">Building the comparison…</p></div>
    }
  `,
})
export class DemoComponent {
  private readonly session = inject(ProfileSessionStore);
  private readonly config = inject(ServerConfigStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly hatching = signal(false);
  protected readonly ready = computed(() => this.config.state() === 'ready');

  /**
   * No params: the cast is fixed, so this runs once. Nothing in here reaches
   * the network — the server config is consulted only to decide whether to
   * offer hatching, never to build the comparison, which is what lets this be
   * the one page that still works when the profile server is unreachable.
   */
  protected readonly demo = resource({
    loader: async () => {
      const cast = await buildDemoCast();
      const slots: CompareSlot[] = await Promise.all(
        cast.map(async (profile) => ({
          ref: profile.phrase,
          payload: profile.payload,
          persona: await personaFromViewPhrase(profile.phrase),
        })),
      );
      return buildCompareModel(slots);
    },
  });

  protected readonly personas = computed(() => {
    if (this.demo.error()) return [];
    return (this.demo.value()?.slots ?? [])
      .map((slot) => slot.persona)
      .filter((persona) => persona != null);
  });

  protected async hatch(): Promise<void> {
    this.hatching.set(true);
    try {
      await this.session.hatch();
      await this.router.navigate(['/me']);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.hatching.set(false);
    }
  }
}
