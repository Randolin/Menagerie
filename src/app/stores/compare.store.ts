import { inject, Injectable, resource, signal } from '@angular/core';
import {
  decryptBlob,
  deriveViewKeys,
  extractViewPhrase,
  migrateToCurrent,
  personaFromViewPhrase,
  type ProfilePayload,
} from '@moxy/core';
import { MAX_COMPARE } from '@moxy/ui';
import { buildCompareModel, type CompareModel, type CompareSlot } from '../compare/compare-model';
import { ServerConfigStore } from './server-config.store';

/** A comparison source: a view phrase to fetch, or an already-decrypted
 * payload (a group member's pseudonymous snapshot). */
export type CompareEntry =
  | { readonly kind: 'phrase'; readonly phrase: string }
  | {
      readonly kind: 'payload';
      readonly payload: ProfilePayload;
      readonly label: string;
      readonly emoji: string | null;
    };

/**
 * Sources queued for comparison (max MAX_COMPARE, deduped). Phrase entries
 * are fetched and decrypted client-side; payload entries arrive decrypted
 * (group snapshots). The comparison itself never touches the server, and
 * nothing about who compared whom persists.
 */
@Injectable({ providedIn: 'root' })
export class CompareStore {
  private readonly config = inject(ServerConfigStore);

  readonly entries = signal<readonly CompareEntry[]>([]);

  private readonly modelResource = resource({
    params: () => ({ entries: this.entries(), state: this.config.state() }),
    loader: async ({ params }) => {
      const slots = await Promise.all(params.entries.map((e) => this.load(e)));
      return buildCompareModel(slots);
    },
  });

  /** Null while (re)computing — views hold the previous render via this. */
  readonly model = this.modelResource.value;

  get full(): boolean {
    return this.entries().length >= MAX_COMPARE;
  }

  /** Extracts a phrase from pasted text/URL. Throws on junk. True if added. */
  addFromText(text: string): boolean {
    const phrase = extractViewPhrase(text);
    if (!phrase) throw new Error('No Menagerie view phrase found in that text.');
    return this.addPhrase(phrase);
  }

  addPhrase(rawPhrase: string): boolean {
    const phrase = extractViewPhrase(rawPhrase);
    if (
      !phrase ||
      this.full ||
      this.entries().some((e) => e.kind === 'phrase' && e.phrase === phrase)
    ) {
      return false;
    }
    this.entries.update((list) => [...list, { kind: 'phrase', phrase }]);
    return true;
  }

  /** A pseudonymous snapshot from a group roster. True if added. */
  addPayload(payload: ProfilePayload, label: string, emoji: string | null): boolean {
    if (this.full || this.entries().some((e) => e.kind === 'payload' && e.label === label)) {
      return false;
    }
    this.entries.update((list) => [...list, { kind: 'payload', payload, label, emoji }]);
    return true;
  }

  remove(index: number): void {
    this.entries.update((list) => list.filter((_, i) => i !== index));
  }

  clear(): void {
    this.entries.set([]);
  }

  private async load(entry: CompareEntry): Promise<CompareSlot> {
    if (entry.kind === 'payload') {
      return {
        ref: entry.label,
        payload: entry.payload,
        persona: null,
        label: entry.label,
        emoji: entry.emoji,
      };
    }
    const phrase = entry.phrase;
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
