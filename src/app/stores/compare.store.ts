import { inject, Injectable, resource, signal } from '@angular/core';
import {
  decryptBlob,
  deriveViewKeys,
  extractViewPhrase,
  migrateToCurrent,
  personaFromViewPhrase,
} from '@moxy/core';
import { MAX_COMPARE } from '@moxy/ui';
import { buildCompareModel, type CompareModel, type CompareSlot } from '../compare/compare-model';
import { ServerConfigStore } from './server-config.store';

/**
 * View phrases queued for comparison (max MAX_COMPARE, deduped). Each is
 * fetched and decrypted client-side; the comparison itself never touches the
 * server. Deliberately transient — nothing about who compared whom persists.
 */
@Injectable({ providedIn: 'root' })
export class CompareStore {
  private readonly config = inject(ServerConfigStore);

  readonly phrases = signal<readonly string[]>([]);

  private readonly modelResource = resource({
    params: () => ({ phrases: this.phrases(), state: this.config.state() }),
    loader: async ({ params }) => {
      const slots = await Promise.all(params.phrases.map((p) => this.load(p)));
      return buildCompareModel(slots);
    },
  });

  /** Null while (re)computing — views hold the previous render via this. */
  readonly model = this.modelResource.value;
  readonly loading = this.modelResource.isLoading;

  get full(): boolean {
    return this.phrases().length >= MAX_COMPARE;
  }

  /** Extracts a phrase from pasted text/URL. Throws on junk. True if added. */
  addFromText(text: string): boolean {
    const phrase = extractViewPhrase(text);
    if (!phrase) throw new Error('No Menagerie view phrase found in that text.');
    return this.addPhrase(phrase);
  }

  addPhrase(rawPhrase: string): boolean {
    const phrase = extractViewPhrase(rawPhrase);
    if (!phrase || this.full || this.phrases().includes(phrase)) return false;
    this.phrases.update((list) => [...list, phrase]);
    return true;
  }

  remove(index: number): void {
    this.phrases.update((list) => list.filter((_, i) => i !== index));
  }

  clear(): void {
    this.phrases.set([]);
  }

  /** Latest computed model, for callers outside templates. */
  current(): CompareModel | undefined {
    return this.model();
  }

  private async load(phrase: string): Promise<CompareSlot> {
    try {
      const client = this.config.client();
      if (!client) throw new Error('No profile server is configured.');
      const { viewLocator, viewKey } = await deriveViewKeys(phrase);
      const record = await client.getView(viewLocator);
      if (!record) throw new Error('No profile answers to this phrase (deleted or replaced?).');
      const payload = migrateToCurrent(await decryptBlob(record.blob_view, viewKey));
      return { ref: phrase, payload, persona: await personaFromViewPhrase(phrase) };
    } catch (err) {
      return { ref: phrase, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
