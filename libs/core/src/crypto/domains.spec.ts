import { describe, expect, test } from 'vitest';
import { DOMAIN } from './domains';

/**
 * The tripwire on the one file whose values can never change.
 *
 * The vector specs (hatch.spec, phrase-compat.spec, sealed-box.spec) would
 * also go red if a domain moved — but they would go red the way any
 * regression does, and a person under time pressure fixes red tests. This one
 * exists to say, in the failure message itself, what the red actually means:
 * every phrase ever minted now opens nothing, for everyone, forever.
 */
const FROZEN: Readonly<Record<keyof typeof DOMAIN, string>> = {
  VIEW_KEYS: 'rzhy65722j6xubt5',
  EDIT_KEYS: '2de3bxpf5i25zzyp',
  GROUP_READ_KEYS: 'h2m7ix287j4ywkcg',
  GROUP_ADMIN_TOKEN: 'a4b2hpnw8zd5th9g',
  METRICS_TOKEN: 'gm5hbrdj7vznners',
  BOOP_SEAL: 'xsrjfcddr8pqb9ab',
  MATCH_TOKEN: '8tam72ccgd5wiqhm',
  PERSONA_COLOR: 'vfrm44ehjfay7ddi',
};

describe('domain separation constants', () => {
  test('have never changed, and never may', () => {
    // If this fails you are about to make every existing view phrase, edit
    // phrase, group phrase and admin phrase derive a different address. There
    // is no migration and no reset: every profile becomes permanently
    // unopenable by the person who owns it. Revert the constant. If you truly
    // need a new derivation, ADD one — never edit one of these.
    expect(DOMAIN).toEqual(FROZEN);
  });

  test('are distinct, which is the entire job', () => {
    const values = Object.values(DOMAIN);
    expect(new Set(values).size, 'two domains share a value').toBe(values.length);
  });

  test('carry no meaning that anything else could want to change', () => {
    // The point of this file. A salt that reads `moxy.hatch.view.v2` looks
    // like an ordinary identifier, so a rebrand or a rename sweep updates it
    // in passing — which is how a product locks its users out by accident.
    // Meaning lives in the constant's NAME, which is free to change; the
    // value is noise, which nothing will ever have a reason to touch.
    const WORDS = /moxy|menagerie|hatch|view|edit|group|admin|metrics|boop|persona|seal|match/i;
    for (const [name, value] of Object.entries(DOMAIN)) {
      expect(value, `${name} reads as a word — regenerate it as noise`).not.toMatch(WORDS);
      expect(value.length, `${name} is too short to be collision-proof`).toBeGreaterThanOrEqual(16);
    }
  });
});
