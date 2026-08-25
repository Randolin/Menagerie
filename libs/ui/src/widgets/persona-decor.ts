// Shared persona decoration helpers.
//
// These four lines lived identically in view, dashboard and group components.
// They're pure functions of a persona, so they're plain exports rather than an
// injectable — DI would add a lifetime and a token to something with neither.
import { HABITAT_META, personaHabitat, type Persona } from '@moxy/core';

export interface HabitatMotif {
  readonly glyph: string;
  readonly title: string;
}

/** `habitat-<name>` for the card's motif, or '' when there's no persona. */
export function habitatClass(persona: Persona | null | undefined): string {
  const habitat = personaHabitat(persona);
  return habitat ? `habitat-${habitat}` : '';
}

/** The creature's nature glyph — its animal's habitat, never its location. */
export function habitatMotif(persona: Persona | null | undefined): HabitatMotif | null {
  const habitat = personaHabitat(persona);
  if (!habitat) return null;
  const meta = HABITAT_META[habitat];
  return { glyph: meta.motif, title: `a creature ${meta.label}` };
}
