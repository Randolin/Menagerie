import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { extractGroupPhrase } from '@moxy/core';
import { ToastService } from '@moxy/ui';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { GroupMembershipStore } from '../stores/group-membership.store';

/** The groups you belong to, and the door into a new one. */
@Component({
  selector: 'moxy-groups',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card">
      <h2>My groups</h2>
      <p class="sub">
        A group is a shared, encrypted roster with its own creature and invite QR. Members deposit a
        snapshot of their open answers — pseudonymously, or openly with their creature — and
        everyone in it can compare across the roster.
      </p>
      @if (newGroup(); as created) {
        <div class="notice">
          Your group is hatched. Share the <strong>invite link</strong>; keep the
          <strong>admin phrase</strong> — it’s the only way to manage or re-mint the group (it’s
          also saved inside your encrypted profile):
          <div class="passphrase-box" style="margin-top:8px">{{ created.adminPhrase }}</div>
        </div>
      }
      @for (g of session.groups(); track g.id) {
        <div class="grid-row" style="align-items:center">
          <div class="grid-item-label">
            {{ groupName(g.groupPhrase) }}
            @if (g.adminPhrase) {
              <span class="fine">creator</span>
            }
            @if (g.memberLocator) {
              <span class="fine">{{
                g.tier === 2 ? 'open' : 'as ' + (g.emoji ?? '') + ' ' + (g.pseudonym ?? 'pseudonym')
              }}</span>
            } @else {
              <span class="fine">not deposited</span>
            }
          </div>
          <div class="grid-answers" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <a class="btn btn-small" [routerLink]="['/group', g.groupPhrase]">Open</a>
          </div>
        </div>
      } @empty {
        <p class="fine">No groups yet. Paste an invite to join one, or hatch your own.</p>
      }
      <form
        style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"
        (submit)="openGroup($event, groupInput)"
      >
        <input
          #groupInput
          type="text"
          placeholder="Paste a group invite link or phrase"
          aria-label="Group invite link or phrase"
          style="flex:1;min-width:220px"
        />
        <button class="btn">Open group</button>
        <button
          class="btn btn-primary"
          type="button"
          [disabled]="creatingGroup()"
          (click)="createGroup()"
        >
          {{ creatingGroup() ? 'Hatching…' : '🐣 Create a group' }}
        </button>
      </form>
    </div>
  `,
})
export class GroupsComponent {
  protected readonly session = inject(ProfileSessionStore);
  private readonly groupStore = inject(GroupMembershipStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly newGroup = signal<{ groupPhrase: string; adminPhrase: string } | null>(null);
  protected readonly creatingGroup = signal(false);

  /** A group's public name is its creature — the phrase head. */
  protected groupName(groupPhrase: string): string {
    return groupPhrase.split('-').slice(0, 3).join('-');
  }

  protected async createGroup(): Promise<void> {
    this.creatingGroup.set(true);
    try {
      this.newGroup.set(await this.groupStore.createGroup());
      this.toast.show('Group hatched — save the admin phrase');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.creatingGroup.set(false);
    }
  }

  protected openGroup(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const phrase = extractGroupPhrase(input.value);
    if (!phrase) {
      this.toast.show('That doesn’t look like a Menagerie group link or phrase.', 'error');
      return;
    }
    input.value = '';
    void this.router.navigate(['/group', phrase]);
  }
}
