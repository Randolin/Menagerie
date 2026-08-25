// The location banner's style, assembled from two strictly separated sources.
//
//   family    ← the tail's place word, via placeFamilyOf. 1 of 12, ~3.55 bits.
//               This is the entire tail-derived surface of the whole app.
//   variation ← the PUBLIC head words (adjA, adjB, animal), which are printed
//               on the persona chip already. Publishes ZERO additional bits.
//
// That split is the reviewable claim of this module: two phrases sharing a
// head must produce identical variant/time/density and differ only in family,
// and two phrases sharing a family must vary only by their head. Both
// directions are asserted in banner.spec.ts.
//
// It is also why the variation is derived by cheap index arithmetic rather
// than a hash: personaFromViewPhrase is async (crypto.subtle), and an async
// getter is unusable from an Angular template. Everything here is synchronous
// and pure, so components can call it directly in a computed().
import type { PlaceFamily } from './place-family';
import { PLACE_FAMILY_META, placeFamilyOf } from './place-family';
import { ADJECTIVES_A, ADJECTIVES_B, ANIMALS } from './wordlists';

/** Head-derived axes. Kept small so each value is visibly distinct. */
export const BANNER_VARIANTS = 8;
export const BANNER_TIMES = 4;
export const BANNER_DENSITIES = 4;

export interface BannerStyle {
  readonly family: PlaceFamily;
  /** `place-<family>` — owns the banner's color. */
  readonly familyClass: string;
  /** `place-v<0..7>` — gradient angle / mottle offset. Head-derived. */
  readonly variantClass: string;
  /** `place-t<0..3>` — overlay warmth, a time-of-day feel. Head-derived. */
  readonly timeClass: string;
  /** 0..3 motif repetitions. Head-derived. */
  readonly density: number;
  /** Evocative family label; never names a word from the phrase. */
  readonly label: string;
  /** Abstract family motif. */
  readonly motif: string;
}

export interface BannerPersonaLike {
  readonly words: readonly [string, string, string];
  readonly colorIndex: number;
}

/**
 * Null whenever a banner must not render: no persona (tier-1 group members and
 * compare payload entries build `persona: null`, and those viewers hold no
 * phrase), or a place word that isn't a real tail place.
 *
 * The null-persona case is the load-bearing guard. It is what keeps the banner
 * off every surface where the viewer doesn't already hold the phrase.
 */
export function bannerStyleFor(
  persona: BannerPersonaLike | null | undefined,
  placeWord: string | null | undefined,
): BannerStyle | null {
  if (!persona) return null;
  const family = placeFamilyOf(placeWord);
  if (!family) return null;

  const [adjA, adjB, animal] = persona.words;
  // Non-negative even when a word somehow isn't found (-1): the modulo of a
  // negative would produce a class name that matches no CSS rule.
  const aIndex = Math.max(0, ADJECTIVES_A.indexOf(adjA));
  const bIndex = Math.max(0, ADJECTIVES_B.indexOf(adjB));
  const animalIndex = Math.max(
    0,
    ANIMALS.findIndex((a) => a.name === animal),
  );

  const meta = PLACE_FAMILY_META[family];
  return {
    family,
    familyClass: `place-${family}`,
    variantClass: `place-v${(persona.colorIndex + aIndex) % BANNER_VARIANTS}`,
    timeClass: `place-t${animalIndex % BANNER_TIMES}`,
    density: bIndex % BANNER_DENSITIES,
    label: meta.label,
    motif: meta.motif,
  };
}
