import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
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
    @if (session.dirty()) {
      <div class="save-bar" role="status">
        <span class="save-bar-label">You have unsaved answers</span>
        <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Saving…' : '💾 Save now' }}
        </button>
      </div>
    } @else if (justSaved()) {
      <div class="save-bar save-bar-done" role="status">
        <span class="save-bar-label">✓ Saved</span>
      </div>
    }
  `,
})
export class SaveBarComponent implements OnDestroy {
  protected readonly session = inject(ProfileSessionStore);
  private readonly toast = inject(ToastService);
  protected readonly saving = signal(false);
  protected readonly justSaved = signal(false);
  private doneTimer: ReturnType<typeof setTimeout> | null = null;

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
        this.flashSaved();
      }
    } catch (err) {
      this.toast.error(err);
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
