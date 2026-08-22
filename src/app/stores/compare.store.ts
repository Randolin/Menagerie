import { Injectable, resource, signal } from '@angular/core';
import { extractPayloadString, compareUrlFor } from '@moxy/core';
import { MAX_COMPARE } from '@moxy/ui';
import { buildCompareModel, type CompareModel } from '../compare/compare-model';

@Injectable({ providedIn: 'root' })
export class CompareStore {
  /** Payload code strings queued for comparison (max MAX_COMPARE, deduped). */
  readonly codes = signal<readonly string[]>([]);

  private readonly modelResource = resource({
    params: () => this.codes(),
    loader: ({ params }) => buildCompareModel(params),
  });

  /** Null while (re)computing — views hold the previous render via this. */
  readonly model = this.modelResource.value;
  readonly loading = this.modelResource.isLoading;

  get full(): boolean {
    return this.codes().length >= MAX_COMPARE;
  }

  /** Extracts a code from pasted text/URL. Throws on junk. True if added. */
  addFromText(text: string): boolean {
    return this.addCode(extractPayloadString(text));
  }

  addCode(code: string): boolean {
    if (this.full || this.codes().includes(code)) return false;
    this.codes.update((c) => [...c, code]);
    return true;
  }

  remove(index: number): void {
    this.codes.update((c) => c.filter((_, i) => i !== index));
  }

  clear(): void {
    this.codes.set([]);
  }

  compareUrl(): string {
    return compareUrlFor(this.codes());
  }

  /** Latest computed model, for callers outside templates. */
  current(): CompareModel | undefined {
    return this.model();
  }
}
