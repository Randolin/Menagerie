// Habitat grouping of the 64 animals — a pure presentation grouping of the
// already-public animal word (word 3 of the view phrase, the creature's
// HEAD). It themes card accents and motifs; nothing more.
//
// NOT FROZEN — unlike the wordlists and color tables around it, habitat
// never enters any credential, hash, or payload, so it may be re-curated
// freely; the worst a change can do is repaint a border. It must, however,
// stay derived from the HEAD only: the view phrase's secret tail (including
// its place word) must never be displayed, themed, or derived into UI —
// see tail-wordlists.ts.
import { ANIMALS } from './wordlists';

export type Habitat = 'forest' | 'water' | 'sky' | 'meadow' | 'mythic';

/** 64 entries — habitat for the same index in ANIMALS. */
export const ANIMAL_HABITATS: readonly Habitat[] = [
  'forest', // fox
  'water', // otter
  'forest', // owl
  'forest', // wolf
  'forest', // bear
  'forest', // panda
  'forest', // koala
  'forest', // tiger
  'meadow', // lion
  'meadow', // cat
  'meadow', // dog
  'meadow', // rabbit
  'meadow', // hamster
  'meadow', // mouse
  'forest', // hedgehog
  'forest', // bat
  'water', // frog
  'water', // turtle
  'meadow', // gecko
  'water', // octopus
  'water', // squid
  'water', // shrimp
  'water', // crab
  'water', // lobster
  'water', // pufferfish
  'water', // fish
  'water', // dolphin
  'water', // whale
  'water', // shark
  'water', // seal
  'water', // penguin
  'water', // duck
  'water', // swan
  'sky', // eagle
  'sky', // parrot
  'sky', // flamingo
  'sky', // peacock
  'meadow', // rooster
  'meadow', // chick
  'sky', // butterfly
  'sky', // bee
  'meadow', // ladybug
  'meadow', // snail
  'mythic', // unicorn
  'mythic', // dragon
  'meadow', // horse
  'meadow', // zebra
  'forest', // deer
  'meadow', // giraffe
  'meadow', // elephant
  'meadow', // rhino
  'water', // hippo
  'meadow', // camel
  'meadow', // llama
  'forest', // sloth
  'meadow', // kangaroo
  'forest', // badger
  'water', // beaver
  'forest', // skunk
  'forest', // raccoon
  'forest', // monkey
  'forest', // gorilla
  'meadow', // goat
  'meadow', // sheep
];

export interface HabitatMeta {
  /** Small decorative glyph for banners and corners. */
  readonly motif: string;
  /** Short display phrase, e.g. "a creature of the forest". */
  readonly label: string;
}

export const HABITAT_META: Record<Habitat, HabitatMeta> = {
  forest: { motif: '🌲', label: 'of the forest' },
  water: { motif: '🌊', label: 'of the water' },
  sky: { motif: '🌤️', label: 'of the sky' },
  meadow: { motif: '🌼', label: 'of the meadow' },
  mythic: { motif: '✨', label: 'of the realm of myth' },
};

/** Habitat for an animal name; null when the name isn't in ANIMALS. */
export function habitatOf(animalName: string): Habitat | null {
  const index = ANIMALS.findIndex((a) => a.name === animalName);
  return index >= 0 ? ANIMAL_HABITATS[index] : null;
}
