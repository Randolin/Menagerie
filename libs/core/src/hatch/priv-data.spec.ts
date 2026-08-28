import { describe, expect, it } from 'vitest';
import { connectionFreshness, migratePrivData, type PrivData } from './priv-data';

describe('connectionFreshness', () => {
  it('is current while the version has not moved', () => {
    expect(connectionFreshness({ lastSeenVersion: 4 }, 4)).toBe('current');
  });

  it('is updated once the profile has been saved again', () => {
    expect(connectionFreshness({ lastSeenVersion: 4 }, 7)).toBe('updated');
  });

  // A profile can only ever be re-keyed forward, but a stale baseline read
  // from another device must never render as a negative "update".
  it('is current when the server is somehow behind the baseline', () => {
    expect(connectionFreshness({ lastSeenVersion: 9 }, 4)).toBe('current');
  });

  it('is gone when nothing answers to the locator', () => {
    expect(connectionFreshness({ lastSeenVersion: 4 }, null)).toBe('gone');
  });

  // The badge is for changes you missed. A creature you have never opened —
  // one kept before freshness checks existed — has no missed changes.
  it('adopts the current version as the baseline when there is none', () => {
    expect(connectionFreshness({}, 12)).toBe('current');
    expect(connectionFreshness({ lastSeenVersion: undefined }, 12)).toBe('current');
  });

  it('still reports a never-opened creature as gone', () => {
    expect(connectionFreshness({}, null)).toBe('gone');
  });
});

describe('migratePrivData and the connection fields', () => {
  function blobWith(connection: Record<string, unknown>): unknown {
    return {
      v: 1,
      viewPhrase: 'mellow-verdant-lobster-mistwoven-emberlit-fernhollow',
      answers: {},
      desiresSalt: null,
      connections: [connection],
    };
  }

  // The whole reason both fields are optional: a blob written before they
  // existed has to keep opening, with no version bump and no upgrader.
  it('opens a connection saved before freshness existed', () => {
    const legacy = blobWith({
      id: 'a',
      label: 'kestrel',
      viewPhrase: 'x-y-z-a-b-c',
      notes: '',
      addedAt: 1,
      updatedAt: 1,
    });
    const priv: PrivData = migratePrivData(legacy);
    expect(priv.connections[0].viewLocator).toBeUndefined();
    expect(priv.connections[0].lastSeenVersion).toBeUndefined();
    expect(connectionFreshness(priv.connections[0], 3)).toBe('current');
  });

  it('round-trips the cached locator and the baseline', () => {
    const priv: PrivData = migratePrivData(
      blobWith({
        id: 'a',
        label: 'kestrel',
        viewPhrase: 'x-y-z-a-b-c',
        notes: '',
        addedAt: 1,
        updatedAt: 1,
        viewLocator: 'ff00',
        lastSeenVersion: 2,
      }),
    );
    expect(priv.connections[0].viewLocator).toBe('ff00');
    expect(connectionFreshness(priv.connections[0], 3)).toBe('updated');
  });
});
