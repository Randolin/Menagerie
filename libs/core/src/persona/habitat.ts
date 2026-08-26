// Habitat grouping of the animals — a pure presentation grouping of the
// already-public animal word (word 3 of the view phrase, the creature's
// HEAD). It themes card accents and motifs; nothing more.
//
// NOT FROZEN — unlike the wordlists and color tables around it, habitat
// never enters any credential, hash, or payload, so it may be re-curated
// freely; the worst a change can do is repaint a border.
//
// Habitat stays derived from the HEAD only (the animal word). It is no longer
// the only location-ish signal: the LOCATION BANNER (place-family.ts) is
// derived from the tail's place word, under the revised rule below. Keep the
// two separate — habitat owns the creature's nature (its motif), the banner
// owns the page's place (its color). Letting both own color makes them clash
// visibly, which is itself a hint that the banner is not animal-derived.
//
// TAIL SECRECY (revised): the tail words are never *displayed* and never
// derived into anything a phrase-less viewer can see. Exactly one coarse
// projection is published: the place word's landform FAMILY (1 of 12,
// ~3.55 bits), and only to viewers who already hold the phrase. Never a base,
// never an adjective, never the suffix itself. All within-family visual
// variation derives from the PUBLIC head words. Bit ledger: hatch/phrases.ts.
import { ANIMALS } from './wordlists';

export type Habitat = 'forest' | 'water' | 'sky' | 'meadow' | 'mythic';

/** One habitat per ANIMALS entry, same index (lockstep asserted). */
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
  // --- appended (64 → 108) ---
  'forest', // orangutan
  'mythic', // mammoth
  'meadow', // bison
  'mythic', // dodo
  'water', // crocodile
  'forest', // snake
  'meadow', // scorpion
  'meadow', // ant
  'forest', // beetle
  'forest', // caterpillar
  'meadow', // cricket
  'meadow', // worm
  'meadow', // turkey
  'sky', // songbird
  'sky', // hatchling
  'meadow', // chicken
  'meadow', // pig
  'forest', // boar
  'meadow', // cow
  'meadow', // ox
  'meadow', // buffalo
  'meadow', // stallion
  'meadow', // ram
  'meadow', // hound
  'meadow', // retriever
  'meadow', // poodle
  'meadow', // tabby
  'forest', // leopard
  'forest', // jaguar
  'forest', // macaque
  'meadow', // bactrian
  'mythic', // sauropod
  'mythic', // raptor
  'mythic', // wyvern
  'meadow', // vole
  'meadow', // rat
  'meadow', // hare
  'water', // humpback
  'water', // minnow
  'water', // jellyfish
  'sky', // goose
  'forest', // moose
  'meadow', // donkey
  'water', // nautilus

  // --- batch 1, in ANIMALS order ---
  'forest', // lynx
  'meadow', // caracal
  'forest', // ocelot
  'forest', // puma
  'meadow', // cheetah
  'meadow', // coyote
  'meadow', // dingo
  'meadow', // fennec
  'meadow', // hyena
  'forest', // marten
  'forest', // wolverine
  'forest', // ferret
  'meadow', // mongoose
  'meadow', // meerkat
  'forest', // coati
  'forest', // kinkajou
  'forest', // ringtail
  'forest', // fossa
  'forest', // binturong
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

/** Convenience over habitatOf for the persona's animal (HEAD word 3). */
export function personaHabitat(
  persona: { readonly words: readonly [string, string, string] } | null | undefined,
): Habitat | null {
  return persona ? habitatOf(persona.words[2]) : null;
}
