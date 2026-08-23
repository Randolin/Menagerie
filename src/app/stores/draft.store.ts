import { computed, Injectable, signal } from '@angular/core';
import type {
  Acceptable,
  Answers,
  AnswerValue,
  ImportanceWeight,
  ItemId,
  Section,
  Weights,
} from '@moxy/core';

/**
 * The working answer set the item editors bind to — in-memory only. The
 * durable copy is the encrypted profile record on the server; explicit Save
 * in the section editor is the durability point. Nothing here ever touches
 * disk, so a shared computer holds no plaintext answers after the tab closes.
 * Importance weights and dealbreaker acceptable-sets live beside the answers
 * and follow the same lifecycle.
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  readonly answers = signal<Answers>({});
  readonly weights = signal<Weights>({});
  readonly acceptable = signal<Acceptable>({});
  readonly hasAnswers = computed(() => Object.keys(this.answers()).length > 0);

  get(id: ItemId): AnswerValue | undefined {
    return this.answers()[id];
  }

  set(id: ItemId, value: AnswerValue | undefined): void {
    this.answers.update((a) => {
      const next = { ...a };
      const empty = value === undefined || (Array.isArray(value) && value.length === 0);
      if (empty) delete next[id];
      else next[id] = value!;
      return next;
    });
    if (this.answers()[id] === undefined) {
      // An unanswered item can't carry a weight.
      this.setWeight(id, undefined);
    }
  }

  weightOf(id: ItemId): ImportanceWeight | undefined {
    return this.weights()[id];
  }

  acceptableOf(id: ItemId): readonly number[] | undefined {
    return this.acceptable()[id];
  }

  setWeight(id: ItemId, weight: ImportanceWeight | undefined): void {
    this.weights.update((w) => {
      const next = { ...w };
      if (weight === undefined) delete next[id];
      else next[id] = weight;
      return next;
    });
    if (weight !== 3) this.setAcceptable(id, undefined);
  }

  setAcceptable(id: ItemId, indexes: readonly number[] | undefined): void {
    this.acceptable.update((d) => {
      const next = { ...d };
      if (indexes === undefined || indexes.length === 0) delete next[id];
      else next[id] = [...indexes];
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
    return this.answeredAmong(section.items.map((it) => it.id));
  }

  answeredAmong(ids: readonly ItemId[]): number {
    const a = this.answers();
    return ids.filter((id) => {
      const v = a[id];
      return v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
    }).length;
  }

  loadFrom(answers: Answers, weights?: Weights, acceptable?: Acceptable): void {
    this.answers.set(structuredClone(answers) as Answers);
    this.weights.set(structuredClone(weights ?? {}) as Weights);
    this.acceptable.set(structuredClone(acceptable ?? {}) as Acceptable);
  }

  clear(): void {
    this.answers.set({});
    this.weights.set({});
    this.acceptable.set({});
  }
}
