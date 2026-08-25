import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';

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
 */
@Component({
  selector: 'moxy-save-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.dirty()) {
      <div class="save-bar" role="status">
        <span class="fine">Unsaved changes</span>
        <button class="btn btn-primary btn-small" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Saving…' : '💾 Save' }}
        </button>
      </div>
    }
  `,
})
export class SaveBarComponent {
  protected readonly session = inject(ProfileSessionStore);
  private readonly toast = inject(ToastService);
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
      }
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
