// Hatch credential derivation.
//
// View phrase → { viewLocator, viewKey }: read capability + decryption key.
// Edit phrase → { editLocator, editKey, editToken }: write capability. The
// server stores only SHA-256(editToken) and opaque ciphertext — it can never
// decrypt, never recover a phrase, and never forge a write.
import { derivePhraseKeys } from '../crypto/phrase-kdf';

// v2: Argon2id derivation (see crypto/phrase-kdf.ts) — bumped together with
// the KDF so v1 (PBKDF2) credentials can never collide with v2 namespaces.
const VIEW_DOMAIN = 'moxy.hatch.view.v2';
const EDIT_DOMAIN = 'moxy.hatch.edit.v2';
// Group domains ride the same Argon2id generation. Domain separation keeps a
// group phrase's derivations unlinkable to any profile namespace.
const GROUP_READ_DOMAIN = 'moxy.group.read.v1';
const GROUP_ADMIN_DOMAIN = 'moxy.group.admin.v1';

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

export interface GroupReadKeys {
  readonly groupLocator: string;
  readonly groupKey: CryptoKey;
}

/** Group phrase (shared invite) → roster address + roster decryption key. */
export async function deriveGroupReadKeys(groupPhrase: string): Promise<GroupReadKeys> {
  const { locator, key } = await derivePhraseKeys(groupPhrase, GROUP_READ_DOMAIN);
  return { groupLocator: locator, groupKey: key };
}

/** Admin phrase (creator only) → the manage/kick/re-mint/delete token. */
export async function deriveGroupAdminToken(adminPhrase: string): Promise<string> {
  const { token } = await derivePhraseKeys(adminPhrase, GROUP_ADMIN_DOMAIN);
  return token;
}
