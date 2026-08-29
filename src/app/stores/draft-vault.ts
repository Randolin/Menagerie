import { Injectable, effect, inject, signal } from '@angular/core';
import { decryptBlob, encryptBlob, type Acceptable, type Answers, type Weights } from '@moxy/core';
import { DraftStore } from './draft.store';
import { APP_STORAGE } from './storage.token';

/** The unsaved draft, encrypted under the edit key. Opt-in, per device. */
const DRAFT_KEY = 'moxy.draft.v1';
/** The opt-in itself. Absent or anything but "1" means off. */
const KEEP_KEY = 'moxy.draft.keep.v1';

/** Long enough that a fast run through a section is one write, not thirty. */
const WRITE_DEBOUNCE_MS = 400;

interface DraftSnapshot {
  answers: Answers;
  weights: Weights;
  acceptable: Acceptable;
}

/**
 * Unsaved answers that survive the tab closing — opt-in, and encrypted.
 *
 * DraftStore keeps answers in memory only, "so a shared computer holds no
 * plaintext answers after the tab closes". That is a real promise to an
 * audience that chose this app partly because of it, and filling ninety-six
 * questions on a train and losing them to a closed tab is a real loss. Both
 * are true, so this resolves them rather than trading one away:
 *
 * The draft is written under `editKey` — the AES key derived from the edit
 * phrase by Argon2id, which lives in memory and is never on disk. A closed
 * tab therefore leaves ciphertext nobody on this device can open, and the
 * next person to type the edit phrase gets their work back. The invariant
 * survives intact: no plaintext answers, ever, at rest.
 *
 * Two honest limits, both stated in the settings copy:
 *
 * - Turn on "remember my edit phrase" as well and the phrase sits in the same
 *   browser storage as the ciphertext, which hands anyone with the device
 *   both halves. Two opt-ins that are individually reasonable compound into
 *   something weaker than either; nobody should discover that themselves.
 * - The blob is bound to a profile by the only thing that can open it. A
 *   draft written under one edit key simply fails to decrypt under another,
 *   so a second person logging in on this device can never inherit the
 *   first's answers — there is no identifier to match, and none is stored.
 */
@Injectable({ providedIn: 'root' })
export class DraftVault {
  private readonly draft = inject(DraftStore);
  private readonly storage = inject(APP_STORAGE);

  readonly enabled = signal(this.readEnabled());

  /** Set while a profile is logged in; the only thing that can open a draft. */
  private key: CryptoKey | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const snapshot: DraftSnapshot = {
        answers: this.draft.answers(),
        weights: this.draft.weights(),
        acceptable: this.draft.acceptable(),
      };
      if (!this.enabled() || !this.key) return;
      this.scheduleWrite(snapshot);
    });
  }

  /** A session began: this key can write and read drafts until logout. */
  arm(key: CryptoKey): void {
    this.key = key;
  }

  /** A session ended. The stored draft goes with it — logging out means out. */
  disarm(): void {
    this.key = null;
    this.cancelPending();
    this.remove();
  }

  /** The draft reached the server; there is nothing left to recover. */
  clear(): void {
    this.cancelPending();
    this.remove();
  }

  async setEnabled(on: boolean): Promise<void> {
    this.enabled.set(on);
    try {
      if (on) this.storage.setItem(KEEP_KEY, '1');
      else this.storage.removeItem(KEEP_KEY);
    } catch {
      /* private mode: the toggle still governs this tab */
    }
    if (on) await this.writeNow();
    else this.clear();
  }

  /**
   * The stored draft for the armed key, or null when there is none, it was
   * written by another profile, or it no longer parses. Every failure is the
   * same answer — a draft that cannot be opened is a draft that isn't there —
   * and a stale blob is dropped rather than left to fail again next time.
   */
  async restore(): Promise<DraftSnapshot | null> {
    if (!this.key) return null;
    let stored: string | null = null;
    try {
      stored = this.storage.getItem(DRAFT_KEY);
    } catch {
      return null;
    }
    if (!stored) return null;
    try {
      const snapshot = await decryptBlob<DraftSnapshot>(stored, this.key);
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.answers) throw new Error('shape');
      return {
        answers: snapshot.answers,
        weights: snapshot.weights ?? {},
        acceptable: snapshot.acceptable ?? {},
      };
    } catch {
      this.remove();
      return null;
    }
  }

  // ---- internals ----------------------------------------------------------

  private scheduleWrite(snapshot: DraftSnapshot): void {
    this.cancelPending();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write(snapshot);
    }, WRITE_DEBOUNCE_MS);
  }

  private async writeNow(): Promise<void> {
    this.cancelPending();
    await this.write({
      answers: this.draft.answers(),
      weights: this.draft.weights(),
      acceptable: this.draft.acceptable(),
    });
  }

  private async write(snapshot: DraftSnapshot): Promise<void> {
    const key = this.key;
    if (!key || !this.enabled()) return;
    try {
      this.storage.setItem(DRAFT_KEY, await encryptBlob(snapshot, key));
    } catch {
      /* quota or private mode — the in-memory draft is unaffected */
    }
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private remove(): void {
    try {
      this.storage.removeItem(DRAFT_KEY);
    } catch {
      /* fine */
    }
  }

  private readEnabled(): boolean {
    try {
      return this.storage.getItem(KEEP_KEY) === '1';
    } catch {
      return false;
    }
  }
}
