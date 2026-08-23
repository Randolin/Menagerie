import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SECTIONS } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ItemEditorComponent } from '../survey/items/item-editor.component';

/**
 * One survey section, hub-and-spoke from the dashboard. Edits live in the
 * draft; “Save” is the explicit durability point that re-encrypts and pushes
 * the whole profile.
 */
@Component({
  selector: 'moxy-section-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ItemEditorComponent],
  template: `
    @if (section(); as s) {
      <div class="card">
        <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
          <a class="btn btn-ghost btn-small" routerLink="/me">← My profile</a>
          <h2 style="margin:0">{{ s.title }}</h2>
        </div>
        <p class="sub">{{ s.blurb }}</p>

        @if (s.privacy === 'match') {
          <div class="notice">
            Answers here are never visible in the open. They travel as scrambled fingerprints
            and only appear when both profiles marked the same desire. “Not for me” answers are
            never shared in any form — but a determined tech-savvy viewer of your profile could
            test for the positive ones, so leave out anything you wouldn’t want guessed.
          </div>
        }

        @if (s.optIn && !draft.isOptedIn(s)) {
          <div class="optin-gate">
            <h3>This section is optional — and private by design.</h3>
            <p class="sub">
              Skip it entirely, or fill it in knowing answers only surface on a mutual match.
            </p>
            <div class="btn-row" style="justify-content:center">
              <button class="btn btn-primary" (click)="draft.setOptIn(s.id)">Open this section</button>
              <a class="btn btn-ghost" routerLink="/me">Back</a>
            </div>
          </div>
        } @else {
          @if (s.privacy === 'open') {
            <p class="fine">
              Answered something that really matters to you? Mark its importance below the
              answer — up to “dealbreaker” — and comparisons will weigh it your way.
            </p>
          }
          @for (item of s.items; track item.id) {
            <moxy-item-editor [item]="item" [showWeight]="s.privacy === 'open'" />
          }
        }

        <div class="btn-row" style="margin-top:20px">
          <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Saving…' : '💾 Save' }}
          </button>
          <a class="btn btn-ghost" routerLink="/me">Back without saving</a>
          <span class="fine" style="margin-left:auto">
            {{ draft.answeredIn(s) }} of {{ s.items.length }} answered — all optional
            @if (session.dirty()) { · unsaved changes }
          </span>
        </div>
      </div>
    } @else {
      <div class="card">
        <h2>Unknown section</h2>
        <a class="btn" routerLink="/me">Back to my profile</a>
      </div>
    }
  `,
})
export class SectionEditorComponent {
  protected readonly draft = inject(DraftStore);
  protected readonly session = inject(ProfileSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.params, {
    initialValue: this.route.snapshot.params,
  });
  protected readonly section = computed(
    () => SECTIONS.find((s) => s.id === String(this.params()['id'])) ?? null,
  );

  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
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
