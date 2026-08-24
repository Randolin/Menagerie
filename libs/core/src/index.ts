// @moxy/core public API — pure TypeScript, zero framework dependencies.
// (no-angular.spec.ts enforces that claim.)

export * from './schema/types';
export { SECTIONS, RETIRED_ITEM_IDS, RETIRED_SECTION_IDS } from './schema/sections';
export * from './schema/schema';
export * from './schema/packs';
export * from './group/group-api';
export * from './group/group-data';
export * from './metrics/metrics-api';
export * from './metrics/buckets';
export * from './boop/boop-api';
export * from './boop/boop-data';
export {
  SEAL_PAD_BYTES,
  generateBoopKeyPair,
  boopPublicKey,
  sealTo,
  openSealed,
  mintBoopBoxKey,
  sealWithKey,
  openWithKey,
  type BoopKeyPair,
} from './boop/sealed-box';

export { bytesToB64url, b64urlToBytes } from './codec/base64url';
export { deflate, inflate } from './codec/compress';
export { buildSharePayload } from './codec/codec';
export { migrateToCurrent } from './codec/migrate';

export { randomBytes, randomIndex, randomLocator, randomSalt, randomToken } from './crypto/random';
export * from './crypto/match-tokens';
export * from './crypto/phrase-kdf';
export { generatePassphrase } from './crypto/passphrase';

export { itemSimilarity } from './match/similarity';
export * from './match/scores';
export * from './match/complement';
export * from './match/reveal';

export * from './persona/persona';
export { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './persona/wordlists';
export { ADJ_B_HUES, adjBHue } from './persona/adjb-hues';
export { ANIMAL_HABITATS, HABITAT_META, habitatOf, type Habitat, type HabitatMeta } from './persona/habitat';

export * from './hatch/constants';
export * from './hatch/keys';
export * from './hatch/phrases';
export { encryptBlob, decryptBlob } from './hatch/blob';
export * from './hatch/priv-data';
export * from './hatch/hatch-api';
export { HatchClient, HatchError, type HatchFailure } from './hatch/hatch-client';

export * from './storage/storage';
