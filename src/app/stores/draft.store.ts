import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  DraftRepository,
  type Answers,
  type AnswerValue,
  type ItemId,
  type Section,
} from '@moxy/core';
import { APP_STORAGE } from './storage.token';

/**
 * The survey answers being edited, autosaved to the unencrypted local draft
 * so a refresh never eats a half-finished survey. The save is synchronous on
 * every change — same semantics as the legacy app; a debounce here loses the
 * answers made in its window when the page reloads (the e2e suite caught
 * exactly that).
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  private readonly repo = new DraftRepository(inject(APP_STORAGE));

  readonly answers = signal<Answers>({});
  /** Vault profile id when editing a saved profile, else null. */
  readonly editingProfileId = signal<string | null>(null);
  readonly hasAnswers = computed(() => Object.keys(this.answers()).length > 0);

  constructor() {
    const stored = this.repo.load();
    if (stored) this.answers.set(stored);
    effect(() => this.repo.save(this.answers()));
  }

  get(id: ItemId): AnswerValue | undefined {
    return this.answers()[id];
  }

  set(id: ItemId, value: AnswerValue | undefined): void {
    this.answers.update((a) => {
      const next = { ...a };
      const empty =
        value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (empty) delete next[id];
      else next[id] = value!;
      return next;
    });
  }

  /** Opt-in flag for gated sections — same `_optin.<sectionId>` key as legacy. */
  setOptIn(sectionId: string): void {
    this.set(`_optin.${sectionId}`, 1);
  }

  isOptedIn(section: Section): boolean {
    if (!section.optIn) return true;
    const a = this.answers();
    return a[`_optin.${section.id}`] !== undefined ||
      section.items.some((it) => a[it.id] !== undefined);
  }

  answeredIn(section: Section): number {
    const a = this.answers();
    return section.items.filter((it) => {
      const v = a[it.id];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
    }).length;
  }

  loadFrom(answers: Answers, profileId: string | null): void {
    this.answers.set(structuredClone(answers) as Answers);
    this.editingProfileId.set(profileId);
  }

  clear(): void {
    this.answers.set({});
    this.editingProfileId.set(null);
    this.repo.clear();
  }
}
