import { randomBytes } from './random';

/**
 * Generate a diceware passphrase. The 7776-word EFF list is imported lazily
 * so its ~78 KB only loads as a separate chunk on the vault screens.
 */
export async function generatePassphrase(words = 5): Promise<string> {
  const { WORDS } = await import('./eff-wordlist');
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    // Rejection sampling for a uniform pick from 7776.
    let idx: number;
    do {
      const r = randomBytes(2);
      idx = (r[0] << 8) | r[1];
    } while (idx >= 65536 - (65536 % WORDS.length));
    out.push(WORDS[idx % WORDS.length]);
  }
  return out.join(' ');
}
