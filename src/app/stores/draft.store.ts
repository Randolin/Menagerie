import { computed, Injectable, signal } from '@angular/core';
import type { Answers, AnswerValue, ItemId, Section } from '@moxy/core';

/**
 * The working answer set the item editors bind to — in-memory only. The
 * durable copy is the encrypted profile record on the server; explicit Save
 * in the section editor is the durability point. Nothing here ever touches
 * disk, so a shared computer holds no plaintext answers after the tab closes.
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  readonly answers = signal<Answers>({});
  readonly hasAnswers = computed(() => Object.keys(this.answers()).length > 0);

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

  /** Opt-in flag for gated sections — the reserved `_optin.<sectionId>` key. */
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

  loadFrom(answers: Answers): void {
    this.answers.set(structuredClone(answers) as Answers);
  }

  clear(): void {
    this.answers.set({});
  }
}
