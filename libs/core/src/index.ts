// @moxy/core public API — pure TypeScript, zero framework dependencies.
// (no-angular.spec.ts enforces that claim.)

export * from './schema/types';
export { SECTIONS } from './schema/sections';
export * from './schema/schema';

export { bytesToB64url, b64urlToBytes } from './codec/base64url';
export { deflate, inflate } from './codec/compress';
export * from './codec/codec';
export { migrateToCurrent } from './codec/migrate';

export { randomBytes, randomSalt } from './crypto/random';
export * from './crypto/match-tokens';
export * from './crypto/vault-crypto';
export { generatePassphrase } from './crypto/passphrase';

export { itemSimilarity } from './match/similarity';
export * from './match/scores';
export * from './match/reveal';

export * from './persona/persona';
export { ADJECTIVES_A, ADJECTIVES_B, ANIMALS, PERSONA_COLORS } from './persona/wordlists';

export * from './hatch/constants';
export * from './hatch/keys';
export * from './hatch/phrases';
export { encryptBlob, decryptBlob } from './hatch/blob';
export * from './hatch/priv-data';

export * from './storage/storage';
export { DraftRepository } from './vault/draft-repo';
export * from './vault/vault-data';
export * from './vault/vault-merge';
export * from './vault/vault-repo';
export * from './sync/sync-api';
export { SyncClient, SyncError, type SyncFailure } from './sync/sync-client';
