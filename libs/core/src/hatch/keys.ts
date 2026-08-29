// Hatch credential derivation.
//
// View phrase → { viewLocator, viewKey }: read capability + decryption key.
// Edit phrase → { editLocator, editKey, editToken }: write capability. The
// server stores only SHA-256(editToken) and opaque ciphertext — it can never
// decrypt, never recover a phrase, and never forge a write.
import { derivePhraseKeys } from '../crypto/phrase-kdf';
import { DOMAIN } from '../crypto/domains';

// Salts live in crypto/domains.ts, opaque and frozen. What matters here is
// only that these four are DIFFERENT from one another: that is what stops a
// view phrase and an edit phrase deriving the same address, and what keeps a
// metrics token unlinkable to the profile that produced it.

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
  const { locator, key } = await derivePhraseKeys(viewPhrase, DOMAIN.VIEW_KEYS);
  return { viewLocator: locator, viewKey: key };
}

export async function deriveEditKeys(editPhrase: string): Promise<EditKeys> {
  const { locator, key, token } = await derivePhraseKeys(editPhrase, DOMAIN.EDIT_KEYS);
  return { editLocator: locator, editKey: key, editToken: token };
}

export interface GroupReadKeys {
  readonly groupLocator: string;
  readonly groupKey: CryptoKey;
}

/** Group phrase (shared invite) → roster address + roster decryption key. */
export async function deriveGroupReadKeys(groupPhrase: string): Promise<GroupReadKeys> {
  const { locator, key } = await derivePhraseKeys(groupPhrase, DOMAIN.GROUP_READ_KEYS);
  return { groupLocator: locator, groupKey: key };
}

/** Admin phrase (creator only) → the manage/kick/re-mint/delete token. */
export async function deriveGroupAdminToken(adminPhrase: string): Promise<string> {
  const { token } = await derivePhraseKeys(adminPhrase, DOMAIN.GROUP_ADMIN_TOKEN);
  return token;
}

/** View phrase → once-per-epoch metrics dedup token (unlinkable by domain). */
export async function deriveMetricsToken(viewPhrase: string): Promise<string> {
  const { token } = await derivePhraseKeys(viewPhrase, DOMAIN.METRICS_TOKEN);
  return token;
}
