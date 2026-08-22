// Unencrypted working-draft persistence, so a page refresh never eats a
// half-finished survey. Best-effort: storage failures are swallowed.
import type { Answers } from '../schema/types';
import type { StorageLike } from '../storage/storage';

const DRAFT_KEY = 'moxy.draft.v1'; // unchanged from the legacy app

export class DraftRepository {
  constructor(private readonly storage: StorageLike) {}

  load(): Answers | null {
    try {
      const raw = this.storage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Answers) : null;
    } catch {
      return null;
    }
  }

  save(answers: Answers): void {
    try {
      this.storage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {
      /* storage may be unavailable; drafts are best-effort */
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }
}
