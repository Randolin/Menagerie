import { randomIndex } from './random';

/**
 * Generate a diceware passphrase. The 7776-word EFF list is imported lazily
 * so its ~78 KB only loads as a separate chunk on the vault screens.
 */
export async function generatePassphrase(words = 5): Promise<string> {
  const { WORDS } = await import('./eff-wordlist');
  return Array.from({ length: words }, () => WORDS[randomIndex(WORDS.length)]).join(' ');
}
