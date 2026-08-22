// Hatch credential derivation.
//
// View phrase → { viewLocator, viewKey }: read capability + decryption key.
// Edit phrase → { editLocator, editKey, editToken }: write capability. The
// server stores only SHA-256(editToken) and opaque ciphertext — it can never
// decrypt, never recover a phrase, and never forge a write.
import { derivePhraseKeys } from '../crypto/phrase-kdf';

const VIEW_DOMAIN = 'moxy.hatch.view.v1';
const EDIT_DOMAIN = 'moxy.hatch.edit.v1';

export interface ViewKeys {
  readonly viewLocator: string;
  readonly viewKey: CryptoKey;
}

export interface EditKeys {
  readonly editLocator: string;
  readonly editKey: CryptoKey;
  readonly editToken: string;
}

export async function deriveViewKeys(viewPhrase: string): Promise<ViewKeys> {
  const { locator, key } = await derivePhraseKeys(viewPhrase, VIEW_DOMAIN);
  return { viewLocator: locator, viewKey: key };
}

export async function deriveEditKeys(editPhrase: string): Promise<EditKeys> {
  const { locator, key, token } = await derivePhraseKeys(editPhrase, EDIT_DOMAIN);
  return { editLocator: locator, editKey: key, editToken: token };
}
