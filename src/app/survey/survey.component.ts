import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SECTIONS } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { ItemEditorComponent } from './items/item-editor.component';

/** Wizard section index survives in-app navigation but resets with the page. */
const lastSection = signal(0);

@Component({
  selector: 'moxy-survey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemEditorComponent],
  template: `
    <div class="survey-progress" role="tablist">
      @for (s of sections; track s.id; let i = $index) {
        <button class="survey-step"
                [class.active]="i === idx()"
                [class.done]="i !== idx() && draft.answeredIn(s) > 0"
                role="tab" [attr.aria-selected]="i === idx()"
                (click)="go(i)">{{ s.title }}</button>
      }
    </div>

    <div class="card">
      <h2>{{ section().title }}</h2>
      <p class="sub">{{ section().blurb }}</p>

      @if (section().privacy === 'match') {
        <div class="notice">
          Answers here are never visible in the open. They travel as scrambled fingerprints
          and only appear when both profiles marked the same desire. “Not for me” answers are
          never shared in any form — but a determined tech-savvy recipient of your link could
          test for the positive ones, so leave out anything you wouldn’t want guessed.
        </div>
      }

      @if (section().optIn && !draft.isOptedIn(section())) {
        <div class="optin-gate">
          <h3>This section is optional — and private by design.</h3>
          <p class="sub">
            Skip it entirely, or fill it in knowing answers only surface on a mutual match.
          </p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-primary" (click)="optIn()">Open this section</button>
            <button class="btn btn-ghost" (click)="next()">Skip it</button>
          </div>
        </div>
      } @else {
        @for (item of section().items; track item.id) {
          <moxy-item-editor [item]="item" />
        }
      }

      <div class="btn-row" style="margin-top:20px">
        @if (idx() > 0) {
          <button class="btn" (click)="prev()">← Back</button>
        }
        @if (isLast()) {
          <button class="btn btn-primary" (click)="finish()">Finish → get my link</button>
        } @else {
          <button class="btn btn-primary" (click)="next()">Next →</button>
        }
        <span class="fine" style="margin-left:auto">
          {{ draft.answeredIn(section()) }} of {{ section().items.length }} answered — all optional
        </span>
      </div>
    </div>
  `,
})
export class SurveyComponent {
  protected readonly draft = inject(DraftStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sections = SECTIONS;
  protected readonly idx = lastSection.asReadonly();
  protected readonly section = computed(() => SECTIONS[this.idx()]);
  protected readonly isLast = computed(() => this.idx() === SECTIONS.length - 1);

  constructor() {
    if (lastSection() >= SECTIONS.length) lastSection.set(0);
    if (this.draft.hasAnswers() && lastSection() === 0 && !this.draft.editingProfileId()) {
      this.toast.show('Restored your draft from this browser.');
    }
  }

  protected go(i: number): void {
    lastSection.set(i);
    window.scrollTo(0, 0);
  }

  protected prev(): void {
    this.go(Math.max(0, this.idx() - 1));
  }

  protected next(): void {
    this.go(Math.min(SECTIONS.length - 1, this.idx() + 1));
  }

  protected optIn(): void {
    this.draft.setOptIn(this.section().id);
  }

  protected finish(): void {
    void this.router.navigate(['/share']);
  }
}
