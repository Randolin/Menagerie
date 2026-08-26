# The animal plan — 108 → 300

A **plan**, not a commitment. `ANIMALS` in `libs/core/src/persona/wordlists.ts` is
append-only and frozen on arrival, so a name only goes in when its sprite is drawn
and the batch ships. Everything below is revisable until then — which is the point:
some of these will turn out undrawable at 16×16, and discovering that should not
leave a permanent dud in the wordlist.

## Why a whole set instead of batch-by-batch

Three things are invisible from inside a single batch:

- **Twins.** `cougar` and `puma` are the same animal. So are `gazelle` and
  `impala`. You only see that with the full list in front of you.
- **Habitat balance.** Habitat drives the avatar's backdrop texture, one of the
  three identity layers. The existing 108 run 43 meadow to 7 mythic, so that layer
  barely discriminates. Only a global pass can correct it.
- **Silhouette.** At 16×16 most of what separates species is gone. Drawing a whole
  register together — all the perching birds, all the wild cats — means one shared
  template designed deliberately, which is why `CANINE`/`ROUND`/`LONGFACE`
  work. Arbitrary batches produce five brown ovals drawn weeks apart.

## Habitat balance

| habitat   | now     | plan adds | after   |
| --------- | ------- | --------- | ------- |
| forest    | 25      | 38        | 63      |
| meadow    | 43      | 39        | 82      |
| water     | 24      | 48        | 72      |
| sky       | 9       | 40        | 49      |
| mythic    | 7       | 27        | 34      |
| **total** | **108** | **192**   | **300** |

Spread tightens from 7–43 (a 6× ratio) to 34–82 (about 2.4×).
Habitat assignments themselves are **not** frozen — `habitat.ts` says so — so these
can be re-tuned later. The names are what cannot be taken back.

## Draw order

Each group is one drawing batch, ordered so the shared-template families come first
and the one-offs last.

### 1. Wild cats (7)

- **forest** — `lynx` · `ocelot` · `puma` · `bobcat`
- **meadow** — `caracal` · `serval` · `cheetah`

### 2. Wild canids (5)

- **meadow** — `jackal` · `coyote` · `dingo` · `hyena` · `fennec`

### 3. Mustelids & small carnivores (9)

- **forest** — `weasel` · `stoat` · `marten` · `wolverine` · `ferret` · `polecat`
- **meadow** — `mongoose` · `meerkat`
- **water** — `mink`

### 4. Rodents & burrowers (10)

- **forest** — `chipmunk` · `shrew` · `mole` · `porcupine`
- **meadow** — `marmot` · `gopher` · `jerboa` · `chinchilla`
- **water** — `capybara` · `muskrat`

### 5. Primates (6)

- **forest** — `lemur` · `gibbon` · `tarsier` · `mandrill` · `chimp`
- **meadow** — `baboon`

### 6. Hoofed & horned (10)

- **forest** — `tapir` · `okapi`
- **meadow** — `gazelle` · `kudu` · `oryx` · `ibex` · `antelope` · `alpaca` · `yak` · `warthog`

### 7. Odd mammals (9)

- **forest** — `pangolin` · `anteater` · `echidna` · `wombat` · `quokka` · `possum`
- **meadow** — `armadillo` · `aardvark`
- **water** — `platypus`

### 8. Marine mammals (7)

- **water** — `walrus` · `narwhal` · `orca` · `beluga` · `manatee` · `dugong` · `sealion`

### 9. Fish (14)

- **water** — `trout` · `salmon` · `carp` · `koi` · `perch` · `pike` · `eel` · `marlin` · `tuna` · `herring` · `catfish` · `seahorse` · `barracuda` · `stingray`

### 10. Marine invertebrates (8)

- **water** — `starfish` · `urchin` · `anemone` · `oyster` · `barnacle` · `limpet` · `abalone` · `cuttlefish`

### 11. Water birds (11)

- **water** — `heron` · `pelican` · `puffin` · `kingfisher` · `cormorant` · `egret` · `ibis` · `tern` · `loon` · `mallard` · `stork`

### 12. Raptors (9)

- **sky** — `falcon` · `osprey` · `kestrel` · `harrier` · `buzzard` · `goshawk` · `condor` · `vulture` · `caracara`

### 13. Songbirds & perching (25)

- **sky** — `robin` · `sparrow` · `raven` · `magpie` · `starling` · `wren` · `finch` · `lark` · `thrush` · `nuthatch` · `chickadee` · `oriole` · `warbler` · `swallow` · `bunting` · `canary` · `budgie` · `lorikeet` · `kookaburra` · `hoopoe` · `jay` · `rook` · `waxwing` · `wagtail` · `shrike`

### 14. Ground birds & ratites (8)

- **forest** — `kiwi`
- **meadow** — `pheasant` · `ostrich` · `emu` · `quail` · `partridge` · `grouse`
- **sky** — `crane`

### 15. Reptiles (11)

- **forest** — `iguana` · `chameleon` · `python` · `boa` · `mamba` · `monitor`
- **meadow** — `cobra` · `viper` · `tortoise`
- **water** — `gharial` · `caiman`

### 16. Amphibians (5)

- **forest** — `salamander` · `treefrog`
- **meadow** — `toad`
- **water** — `axolotl` · `newt`

### 17. Insects & arachnids (11)

- **forest** — `cicada` · `centipede`
- **meadow** — `mantis` · `locust` · `bumblebee` · `grasshopper`
- **sky** — `moth` · `wasp` · `hornet` · `dragonfly` · `firefly`

### 18. Mythic (27)

- **mythic** — `griffin` · `phoenix` · `kraken` · `chimera` · `pegasus` · `hydra` · `sphinx` · `yeti` · `kelpie` · `basilisk` · `minotaur` · `centaur` · `siren` · `golem` · `troll` · `ogre` · `wraith` · `djinn` · `roc` · `thunderbird` · `selkie` · `satyr` · `harpy` · `manticore` · `leviathan` · `gargoyle` · `jackalope`

## Before any of this can merge

`persona.spec.ts` asserts every animal has a **unique single-codepoint emoji**, and
that supply is exhausted at 108. Adding any of these fails the suite until emoji is
demoted to optional:

1. `AnimalEntry.emoji` becomes optional; uniqueness is asserted only among animals
   that have one.
2. `BoopContent` carries the animal name alongside emoji (additive —
   `migrateBoopContent` already tolerates absent fields).
3. The emoji fallback in `creature-icon` stays, for 🥚, group pseudonyms, and
   anything arriving over the wire.

Safe now that sprite coverage is strict: a new animal cannot render as nothing,
because it cannot merge without a sprite.

## Known weak spots

- `cougar` reads like the existing `tiger`/`lion` at 16×16; the wild-cat group
  is the hardest to keep distinct and may need trimming once drawn.
- `crane` is also a machine, which may read oddly mid-phrase.
- `limpet`, `barnacle`, `abalone` are shells with no face — closer to
  `nautilus` than to a creature.
- The mythic set is the only group with no reference photo to work from, so expect
  the most revision there.
