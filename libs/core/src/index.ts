// @moxy/core public API — pure TypeScript, zero framework dependencies.
// (no-angular.spec.ts enforces that claim.)

export * from './schema/types';
export { SECTIONS } from './schema/sections';
export * from './schema/schema';
export * from './schema/gating';
export * from './group/group-api';
export * from './group/group-data';
export * from './metrics/metrics-api';
export * from './metrics/buckets';
export * from './boop/boop-api';
export * from './boop/boop-data';
export {
  generateBoopKeyPair,
  boopPublicKey,
  sealTo,
  openSealed,
  mintBoopBoxKey,
  sealWithKey,
  openWithKey,
  type BoopKeyPair,
} from './boop/sealed-box';

export { buildSharePayload } from './codec/codec';
export { migrateToCurrent } from './codec/migrate';

export { randomBytes, randomIndex, randomLocator, randomSalt, randomToken } from './crypto/random';
export * from './crypto/match-tokens';
export * from './crypto/phrase-kdf';

export { itemSimilarity } from './match/similarity';
export * from './match/scores';
export * from './match/complement';
export * from './match/reveal';

export * from './persona/persona';
export { ANIMALS } from './persona/wordlists';
export {
  ANIMAL_HABITATS,
  HABITAT_META,
  habitatOf,
  personaHabitat,
  type Habitat,
  type HabitatMeta,
} from './persona/habitat';
export {
  PLACE_FAMILIES,
  PLACE_FAMILY_META,
  placeFamilyOf,
  type PlaceFamily,
  type PlaceFamilyMeta,
} from './persona/place-family';
export { bannerStyleFor, type BannerStyle, type BannerPersonaLike } from './persona/banner';

export * from './hatch/constants';
export * from './hatch/keys';
export * from './hatch/phrases';
export { encryptBlob, decryptBlob } from './hatch/blob';
export * from './hatch/priv-data';
export * from './hatch/hatch-api';
export { HatchClient, HatchError, fetchViewPayload, type HatchFailure } from './hatch/hatch-client';

export * from './storage/storage';
