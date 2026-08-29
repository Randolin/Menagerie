import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

/** Long enough to register, short enough not to become furniture. */
const SAVED_FLASH_MS = 2200;

/**
 * The single durability point, now that answers are edited in place.
 *
 * Editing used to end at a page with a Save button on it; with every category
 * on one screen there is no such page, so Save follows you instead. The bar
 * exists only while there is something to save — a permanently docked toolbar
 * would be exactly the persistent clutter this redesign removes.
 *
 * Explicitly NOT autosave: saving re-encrypts and pushes the whole profile, so
 * it stays a deliberate act with a visible result, and a conflicting save from
 * another device stays something a person is told about rather than something
 * that quietly overwrites.
 *
 * That deliberate act has to be findable, though. The bar states what is at
 * stake rather than labelling itself, and holds a confirmation for a moment
 * after the save so the act has a consequence where the person is looking —
 * the toast alone fires in the corner and is easy to miss. It still exists
 * only while it has something to say: a permanently docked toolbar is the
 * clutter this redesign removed.
 */
@Component({
  selector: 'moxy-save-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.dirty() && session.saveState() === 'offline') {
      <div class="save-bar save-bar-offline" role="status">
        <span class="save-bar-label">{{ offlineNote() }}</span>
        <button class="btn" [disabled]="saving()" (click)="save()">
          @if (saving()) {
            <span i18n>Saving…</span>
          } @else {
            <span i18n>Try again</span>
          }
        </button>
      </div>
    } @else if (session.dirty()) {
      <div class="save-bar" role="status">
        <span i18n class="save-bar-label">You have unsaved answers</span>
        <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
          @if (saving()) {
            <span i18n>Saving…</span>
          } @else {
            <span i18n>💾 Save now</span>
          }
        </button>
      </div>
    } @else if (justSaved()) {
      <div class="save-bar save-bar-done" role="status">
        <span i18n class="save-bar-label">✓ Saved</span>
      </div>
    }
  `,
})
export class SaveBarComponent implements OnDestroy {
  protected readonly session = inject(ProfileSessionStore);
  private readonly toast = inject(ToastService);
  protected readonly saving = signal(false);
  protected readonly justSaved = signal(false);

  /**
   * The offline line has to answer the question the person is actually
   * asking — "have I lost this?" — and the true answer depends on a setting
   * they may not remember making, so it says which one is in force rather
   * than reassuring them generically.
   */
  protected readonly offlineNote = computed(() =>
    this.session.keepDraft()
      ? 'Offline — your answers are kept on this device and will save when you’re back.'
      : 'Offline — your answers are safe in this tab. Leave it open; they’ll save when you’re back.',
  );
  private doneTimer: ReturnType<typeof setTimeout> | null = null;

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.session.save();
      if (this.session.saveState() === 'conflict') {
        this.toast.show(
          $localize`Saved elsewhere first — this device now shows the newer copy. Re-apply your edit if it matters.`,
          'error',
        );
      } else {
        this.toast.show($localize`Saved`);
        this.flashSaved();
      }
    } catch (err) {
      // Offline already has a bar of its own saying the useful thing; a red
      // toast on top of it would read as a second, worse problem.
      if (this.session.saveState() !== 'offline') this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private flashSaved(): void {
    if (this.doneTimer) clearTimeout(this.doneTimer);
    this.justSaved.set(true);
    this.doneTimer = setTimeout(() => this.justSaved.set(false), SAVED_FLASH_MS);
  }

  ngOnDestroy(): void {
    if (this.doneTimer) clearTimeout(this.doneTimer);
  }
}
