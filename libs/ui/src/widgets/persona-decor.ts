// Shared persona decoration helper.
//
// This lived identically in view, dashboard and group components. It's a pure
// function of a persona, so it's a plain export rather than an injectable —
// DI would add a lifetime and a token to something with neither.
//
// The habitat MOTIF glyph that used to live here is gone: the creature is now
// drawn as an avatar, and an emoji beside it was a second, worse picture of
// the same animal. Habitat still shows — as the avatar's backdrop texture and
// the card's accent class — just not as a glyph.
import { personaHabitat, type Persona } from '@mng/core';

/** `habitat-<name>` for the card's motif, or '' when there's no persona. */
export function habitatClass(persona: Persona | null | undefined): string {
  const habitat = personaHabitat(persona);
  return habitat ? `habitat-${habitat}` : '';
}
