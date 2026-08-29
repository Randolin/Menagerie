/**
 * Domain-separation constants. Every one of these is frozen forever.
 *
 * These strings are salts and info-labels: they are what makes a view phrase
 * and an edit phrase derive different addresses from the same words, and what
 * keeps a metrics token unlinkable to the profile that produced it. They are
 * inputs to key derivation, which means the value of each one IS the address
 * of everything derived under it. Change a value and every phrase minted
 * before the change opens nothing, permanently, for everyone — there are no
 * accounts here and no reset.
 *
 * WHY THEY LOOK LIKE NOISE, which is the whole point of this file:
 *
 * They used to read `moxy.hatch.view.v2` — the product's old name, spelled
 * out in a cryptographic salt. Nothing was wrong with it as a salt; what was
 * wrong was that it *looked editable*. It sat in the same namespace as
 * package aliases, storage keys and CSS selectors, all of which are ordinary
 * mutable things that a rebrand, a refactor or a tidy-up would rightly
 * update. Sooner or later someone renames the lot in one pass, the frozen
 * vectors go red, and the only thing standing between that and locking every
 * user out of their own profile is whether the person reading the failure
 * understands why it is there.
 *
 * So the meaning lives in the constant's NAME, which is ordinary TypeScript
 * and may be renamed freely, and the value carries none at all. There is
 * nothing in `rzhy65722j6xubt5` that any future rename could plausibly want
 * to update. That is not obscurity for its own sake — it is the smallest
 * possible surface for a mistake nobody can undo.
 *
 * Adding a new derivation? Generate a fresh random token, never a variation
 * of an existing one, and add it here rather than inline at the call site.
 * `domains.spec.ts` pins every value and will tell you what you are about to
 * cost people if you change one.
 */
export const DOMAIN = {
  /** View phrase → read locator + decryption key. */
  VIEW_KEYS: 'rzhy65722j6xubt5',
  /** Edit phrase → write locator, key, and token. */
  EDIT_KEYS: '2de3bxpf5i25zzyp',
  /** Group phrase → roster address + roster key. */
  GROUP_READ_KEYS: 'h2m7ix287j4ywkcg',
  /** Admin phrase → the manage/kick/re-mint/delete token. */
  GROUP_ADMIN_TOKEN: 'a4b2hpnw8zd5th9g',
  /** View phrase → once-per-epoch metrics dedup token, unlinkable by domain. */
  METRICS_TOKEN: 'gm5hbrdj7vznners',
  /** HKDF info label for a sealed boop's one-shot key. */
  BOOP_SEAL: 'xsrjfcddr8pqb9ab',
  /** Salted desire fingerprints — the mutual-only reveal. */
  MATCH_TOKEN: '8tam72ccgd5wiqhm',
  /** Creature accent colour, derived from the public head words. */
  PERSONA_COLOR: 'vfrm44ehjfay7ddi',
} as const;
