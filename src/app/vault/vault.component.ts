import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { extractPayloadString, generatePassphrase, type VaultConnection, type VaultProfile } from '@moxy/core';
import { ToastService, copyText, downloadText } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { VaultStore } from '../stores/vault.store';
import { CompareStore } from '../stores/compare.store';
import { SyncSettingsStore } from '../stores/sync-settings.store';
import { ShareLinkService } from '../share-link.service';
import { UnlockFormComponent } from '../share/unlock-form.component';

@Component({
  selector: 'moxy-vault',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UnlockFormComponent],
  template: `
    <h1>Your vault</h1>

    @if (!vault.unlocked()) {
      @if (newPassphrase(); as pass) {
        <div class="card">
          <h2>Your passphrase — write it down now</h2>
          <p class="sub">
            Shown once, stored nowhere. Anyone with these five words can open this vault, and
            no one can without them.
          </p>
          <div class="passphrase-box">{{ pass }}</div>
          <div class="btn-row">
            <button class="btn" (click)="copy(pass, 'Copied — store it safely')">📋 Copy</button>
            <button class="btn btn-primary" (click)="createVault(pass)">
              I’ve saved it — create vault
            </button>
            <button class="btn btn-ghost" (click)="newPassphrase.set(null)">Cancel</button>
          </div>
        </div>
      } @else {
        <div class="card">
          <h2>Unlock</h2>
          <p class="sub">
            Enter your passphrase. It never leaves this device — it only derives the key that
            decrypts your vault.
          </p>
          <div class="field">
            <span class="field-label">Sync server <span class="fine">(optional)</span></span>
            <div class="field-hint">
              Have a synced vault? Enter its server address and your passphrase — your
              encrypted vault will be fetched and opened right here.
            </div>
            <input type="text" placeholder="https://sync.example.org"
                   aria-label="Sync server address"
                   [value]="syncSettings.serverUrl()"
                   (change)="syncSettings.setServerUrl($any($event.target).value)">
          </div>
          <moxy-unlock-form [busy]="unlocking()" (passphrase)="unlock($event)" />
          <p class="fine">
            Without a sync server, vaults live per-device; export/import moves them by file.
          </p>
        </div>
        <div class="card">
          <h2>New here?</h2>
          <p class="sub">
            A vault lets you save your profile to edit later, and keep a list of connections —
            all encrypted with a passphrase we generate for you. No email, no username, nothing
            to identify you. If the passphrase is lost, the vault is unrecoverable — by design.
          </p>
          <div class="btn-row">
            <button class="btn btn-primary" (click)="generate()">🔑 Create a vault</button>
          </div>
        </div>
        <div class="card">
          <h2>Import a vault export</h2>
          <p class="sub">Moving devices by file? Pick your exported vault, then enter its passphrase.</p>
          <form (submit)="importVault($event, file.files, pass.value)">
            <div class="field">
              <input #file type="file" accept="application/json,.json" aria-label="Vault export file">
            </div>
            <div class="field">
              <input #pass type="text" placeholder="passphrase for that vault"
                     aria-label="Passphrase" autocomplete="off">
            </div>
            <button class="btn">Import</button>
          </form>
        </div>
      }
    } @else {
      <div class="card">
        <h2>My profiles</h2>
        @if (vault.profiles().length === 0) {
          <p class="sub">No saved profiles yet. Finish the survey and save it here.</p>
          <a class="btn" routerLink="/survey">Go to survey</a>
        }
        @for (p of vault.profiles(); track p.id) {
          <div class="vault-item">
            <span class="vault-item-name">{{ p.label }}</span>
            <span class="vault-item-meta">{{ formatDate(p.updatedAt) }}</span>
            <div class="btn-row">
              <button class="btn btn-small" (click)="edit(p)">Edit</button>
              <button class="btn btn-small" (click)="copyLink(p)">Copy link</button>
              <button class="btn btn-small btn-danger" (click)="deleteProfile(p)">Delete</button>
            </div>
          </div>
        }
      </div>

      <div class="card">
        <h2>Saved connections</h2>
        @if (vault.connections().length === 0) {
          <p class="sub">
            When someone shares a profile with you, save it here to revisit or compare later.
          </p>
        }
        @for (c of vault.connections(); track c.id) {
          <div class="vault-item" style="align-items:flex-start">
            <div style="flex:1;min-width:200px">
              <div class="vault-item-name">{{ c.label }}</div>
              <div class="vault-item-meta">saved {{ formatDate(c.addedAt) }}</div>
              <div style="margin-top:8px">
                <textarea placeholder="Notes…" [attr.aria-label]="'Notes about ' + c.label"
                          [value]="c.notes"
                          (input)="noteChanged(c, $any($event.target).value)"></textarea>
              </div>
            </div>
            <div class="btn-row">
              <button class="btn btn-small" (click)="viewConnection(c)">View</button>
              <button class="btn btn-small" (click)="compareConnection(c)">Compare</button>
              <button class="btn btn-small btn-danger" (click)="deleteConnection(c)">Remove</button>
            </div>
          </div>
        }
        <form style="margin-top:14px;display:grid;gap:8px"
              (submit)="addConnection($event, connName.value, connCode.value)">
          <input #connName type="text" placeholder="Their name (for your eyes only)"
                 aria-label="Connection name">
          <input #connCode type="text" placeholder="Their profile link or code"
                 aria-label="Connection profile link">
          <div><button class="btn btn-small">Add connection</button></div>
        </form>
      </div>

      <div class="card">
        <h2>Sync</h2>
        @if (!vault.syncEnabled()) {
          <p class="sub">
            Keep this vault available on other devices: its encrypted blob is stored on a sync
            server under a random address derived from your passphrase. The server can never
            read it — and never learns who you are.
          </p>
          <div class="field">
            <span class="field-label">Sync server</span>
            <input type="text" placeholder="https://sync.example.org"
                   aria-label="Sync server address"
                   [value]="syncSettings.serverUrl()"
                   (change)="syncSettings.setServerUrl($any($event.target).value)">
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" (click)="enableSync()">Enable sync</button>
          </div>
        } @else {
          <p class="sub" data-sync-status>
            @switch (vault.syncStatus()) {
              @case ('synced') { ✅ Synced with {{ syncSettings.serverUrl() }} }
              @case ('syncing') { ⏳ Syncing… }
              @case ('conflict-resolving') { ⏳ Merging changes from another device… }
              @case ('error') { ⚠️ Sync problem — your data is safe on this device. }
              @default { Sync is on. }
            }
          </p>
          @if (vault.lastSyncError(); as err) { <p class="fine">{{ err }}</p> }
          <div class="btn-row">
            <button class="btn btn-small" (click)="syncNow()">🔄 Sync now</button>
            <button class="btn btn-small btn-danger" (click)="disableSync(true)">
              Turn off — delete server copy
            </button>
            <button class="btn btn-small btn-ghost" (click)="disableSync(false)">
              Turn off on this device only
            </button>
          </div>
        }
      </div>

      <div class="card">
        <h2>Housekeeping</h2>
        @if (proposedPassphrase(); as pass) {
          <p class="sub">
            Your new passphrase — shown once, stored nowhere. The old one stops working the
            moment you switch.
          </p>
          <div class="passphrase-box">{{ pass }}</div>
          <div class="btn-row">
            <button class="btn" (click)="copy(pass, 'Copied — store it safely')">📋 Copy</button>
            <button class="btn btn-primary" (click)="confirmChangePassphrase(pass)">
              I’ve saved it — switch
            </button>
            <button class="btn btn-ghost" (click)="proposedPassphrase.set(null)">Cancel</button>
          </div>
        } @else {
          <div class="btn-row">
            <button class="btn" (click)="exportVault()">⬇️ Export vault (encrypted)</button>
            <button class="btn" (click)="proposeChangePassphrase()">🔁 Change passphrase</button>
            <button class="btn" (click)="lock()">🔒 Lock vault</button>
          </div>
          <p class="fine" style="margin-top:10px">
            The export file is the same encrypted blob stored in this browser — safe to keep in
            cloud storage, useless without the passphrase.
          </p>
        }
      </div>
    }
  `,
})
export class VaultComponent {
  protected readonly vault = inject(VaultStore);
  protected readonly syncSettings = inject(SyncSettingsStore);
  private readonly draft = inject(DraftStore);
  private readonly compare = inject(CompareStore);
  private readonly shareLink = inject(ShareLinkService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly unlocking = signal(false);
  protected readonly newPassphrase = signal<string | null>(null);
  protected readonly proposedPassphrase = signal<string | null>(null);
  private readonly noteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  protected formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString();
  }

  protected async copy(text: string, okMessage: string): Promise<void> {
    this.toast.show((await copyText(text)) ? okMessage : 'Copy failed');
  }

  protected async unlock(pass: string): Promise<void> {
    this.unlocking.set(true);
    try {
      if (await this.vault.open(pass)) this.toast.show('Vault unlocked');
      else this.toast.show('No vault found for that passphrase', 'error');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      this.unlocking.set(false);
    }
  }

  protected async generate(): Promise<void> {
    this.newPassphrase.set(await generatePassphrase(5));
  }

  protected async createVault(pass: string): Promise<void> {
    await this.vault.open(pass, { createIfMissing: true });
    this.newPassphrase.set(null);
    this.toast.show('Vault created');
  }

  protected async importVault(event: Event, files: FileList | null, pass: string): Promise<void> {
    event.preventDefault();
    const f = files?.[0];
    if (!f) {
      this.toast.show('Choose a vault file first', 'error');
      return;
    }
    try {
      await this.vault.importBlob(await f.text(), pass);
      this.toast.show('Vault imported and unlocked');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected edit(p: VaultProfile): void {
    this.draft.loadFrom(p.answers, p.id);
    void this.router.navigate(['/survey']);
  }

  protected async copyLink(p: VaultProfile): Promise<void> {
    const { url } = await this.shareLink.encode(p.answers);
    this.toast.show((await copyText(url)) ? 'Fresh share link copied' : 'Copy failed');
  }

  protected async deleteProfile(p: VaultProfile): Promise<void> {
    if (!confirm(`Delete profile “${p.label}” from the vault?`)) return;
    await this.vault.deleteProfile(p.id);
    if (this.draft.editingProfileId() === p.id) this.draft.editingProfileId.set(null);
  }

  protected noteChanged(c: VaultConnection, notes: string): void {
    const existing = this.noteTimers.get(c.id);
    if (existing) clearTimeout(existing);
    this.noteTimers.set(
      c.id,
      setTimeout(() => void this.vault.updateConnection(c.id, { notes }), 600),
    );
  }

  protected viewConnection(c: VaultConnection): void {
    try {
      const code = extractPayloadString(c.code);
      void this.router.navigateByUrl('/p=' + code);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected compareConnection(c: VaultConnection): void {
    try {
      this.compare.addCode(extractPayloadString(c.code));
      void this.router.navigate(['/compare']);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async deleteConnection(c: VaultConnection): Promise<void> {
    if (!confirm(`Remove “${c.label}”?`)) return;
    await this.vault.deleteConnection(c.id);
  }

  protected async addConnection(event: Event, name: string, codeText: string): Promise<void> {
    event.preventDefault();
    try {
      const code = extractPayloadString(codeText);
      await this.vault.saveConnection(name.trim() || 'Unnamed', code);
      this.toast.show('Connection saved');
      (event.target as HTMLFormElement).reset();
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  // --- sync actions --------------------------------------------------------

  protected async enableSync(): Promise<void> {
    try {
      await this.vault.enableSync();
      this.toast.show('Sync enabled — this vault now follows your passphrase to any device');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async disableSync(deleteRemote: boolean): Promise<void> {
    const message = deleteRemote
      ? 'Turn off sync and delete the server copy? Other devices will stop receiving updates and the server keeps nothing.'
      : 'Turn off sync on this device only? The server copy and other devices keep syncing; this device diverges from here.';
    if (!confirm(message)) return;
    try {
      await this.vault.disableSync({ deleteRemote });
      this.toast.show('Sync turned off');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async syncNow(): Promise<void> {
    try {
      await this.vault.syncNow();
      this.toast.show('Synced');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected async proposeChangePassphrase(): Promise<void> {
    this.proposedPassphrase.set(await generatePassphrase(5));
  }

  protected async confirmChangePassphrase(pass: string): Promise<void> {
    try {
      await this.vault.changePassphrase(pass);
      this.proposedPassphrase.set(null);
      this.toast.show('Passphrase changed — the old one no longer opens this vault');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  protected exportVault(): void {
    downloadText('moxy-vault-export.json', this.vault.exportBlob());
    this.toast.show('Export downloaded — it stays encrypted');
  }

  protected lock(): void {
    this.vault.lock();
    this.toast.show('Vault locked');
  }
}
