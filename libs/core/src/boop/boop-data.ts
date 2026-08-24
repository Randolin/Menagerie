// The JSON inside a sealed knock (v1). Everything here is a CLAIM by the
// sender — sealed boxes authenticate nothing (see sealed-box.ts). There is
// no free-text message body, by the same principle that keeps profiles
// free of free text: intents come from a fixed list, the contact platform
// is an index into a fixed list, and the handle is a short single token.
// Escalation is structural: attach a view phrase (mutual profile
// visibility) or a contact card (off-platform, de-anonymizing — the UI
// gates both behind explicit advisories).

/** Fixed first-contact intents; knocks carry indexes, never text. */
export const BOOP_INTENTS = [
  'Curious to connect',
  'We seem compatible',
  'Open to chatting elsewhere',
  'Interested in dating',
  'Looking for friends',
  'Would love to compare notes',
] as const;

/** Fixed contact platforms; a contact card carries an index, never a name. */
export const CONTACT_PLATFORMS = [
  'Signal',
  'Discord',
  'Matrix',
  'Telegram',
  'Instagram',
  'Email',
  'Other',
] as const;

export const CONTACT_HANDLE_MAX = 64;
export const BOOP_LABEL_MAX = 48;

export interface BoopContact {
  platform: number;
  handle: string;
}

/** Credentials for the sender's one-shot reply box (a plain boop inbox). */
export interface BoopReplyBox {
  locator: string;
  token: string;
  /** Raw AES-GCM key, b64url — the reply is encryptBlob'd under it. */
  key: string;
}

export interface BoopContent {
  v: 1;
  kind: 'boop' | 'reply';
  /** Claimed sender identity: creature name (or pseudonym) + emoji. */
  from: { label: string; emoji: string };
  intents: number[];
  attachments?: {
    viewPhrase?: string;
    contact?: BoopContact;
  };
  replyBox?: BoopReplyBox;
}

/** One handle token: short, no whitespace, no URL scheme smuggling. */
export function validContactHandle(handle: string): boolean {
  return (
    handle.length > 0 &&
    handle.length <= CONTACT_HANDLE_MAX &&
    !/\s/.test(handle) &&
    !handle.includes('://')
  );
}

export function buildBoop(
  kind: 'boop' | 'reply',
  from: { label: string; emoji: string },
  intents: readonly number[],
  attachments?: { viewPhrase?: string; contact?: BoopContact },
  replyBox?: BoopReplyBox,
): BoopContent {
  const content: BoopContent = {
    v: 1,
    kind,
    from: { label: from.label.slice(0, BOOP_LABEL_MAX), emoji: from.emoji },
    intents: [...new Set(intents)].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < BOOP_INTENTS.length,
    ),
  };
  const contact = attachments?.contact;
  const cleaned: BoopContent['attachments'] = {};
  if (attachments?.viewPhrase) cleaned.viewPhrase = attachments.viewPhrase;
  if (contact) {
    if (
      !Number.isInteger(contact.platform) ||
      contact.platform < 0 ||
      contact.platform >= CONTACT_PLATFORMS.length ||
      !validContactHandle(contact.handle)
    ) {
      throw new Error('Malformed contact card.');
    }
    cleaned.contact = { platform: contact.platform, handle: contact.handle };
  }
  if (cleaned.viewPhrase || cleaned.contact) content.attachments = cleaned;
  if (replyBox) content.replyBox = { ...replyBox };
  return content;
}

/** Validate an opened knock; throws on anything malformed or unknown. */
export function migrateBoopContent(raw: unknown): BoopContent {
  if (raw === null || typeof raw !== 'object') throw new Error('Malformed boop.');
  const data = raw as Partial<BoopContent> & { v?: number };
  if (data.v !== 1) throw new Error(`Unknown boop version (v${String(data.v)}).`);
  if (data.kind !== 'boop' && data.kind !== 'reply') throw new Error('Malformed boop.');
  if (
    typeof data.from?.label !== 'string' ||
    data.from.label.length === 0 ||
    data.from.label.length > BOOP_LABEL_MAX ||
    typeof data.from.emoji !== 'string'
  ) {
    throw new Error('Malformed boop.');
  }
  if (!Array.isArray(data.intents)) throw new Error('Malformed boop.');
  return buildBoop(
    data.kind,
    data.from,
    data.intents,
    data.attachments && typeof data.attachments === 'object'
      ? {
          viewPhrase:
            typeof data.attachments.viewPhrase === 'string'
              ? data.attachments.viewPhrase
              : undefined,
          contact: data.attachments.contact,
        }
      : undefined,
    data.replyBox &&
      typeof data.replyBox.locator === 'string' &&
      typeof data.replyBox.token === 'string' &&
      typeof data.replyBox.key === 'string'
      ? data.replyBox
      : undefined,
  );
}
