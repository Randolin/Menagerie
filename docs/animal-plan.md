# The animal plan — 108 → 300 · **COMPLETE**

All 192 planned creatures are drawn and shipped; `ANIMALS` stands at 300 with a
sprite and a habitat for every entry. This file is kept as the record of what
was chosen and why — the review pass below is still the argument for every cut.

A **plan**, not a commitment. `ANIMALS` in `libs/core/src/persona/wordlists.ts` is
append-only and frozen on arrival, so a name only goes in when its sprite is drawn
and its batch ships. Everything here stays revisable until then — which is the
point: some of these will prove undrawable at 16×16, and finding that out should
not leave a permanent dud in a wordlist that can never be edited.

Every name below is checked against `ADJECTIVES_A`, `ADJECTIVES_B`, both tail
wordlists and the existing 108: no duplicates, no reuse, no cross-list collisions.
That check is what caught `swift`, which is already an adjective.

## Why a whole set instead of batch-by-batch

Three things are invisible from inside a single batch:

- **Twins.** `puma` and `cougar` are the same animal; `gazelle` and `impala`
  may as well be. You only see that with the full list in front of you.
- **Habitat balance.** Habitat drives the avatar's backdrop texture, one of the three
  identity layers. The existing 108 run 43 meadow to 7 mythic, so that layer barely
  discriminates. Only a global pass corrects it.
- **Silhouette.** At 16×16 most of what separates species is gone. A register drawn
  together shares one deliberate template — which is why `CANINE`, `ROUND` and
  `LONGFACE` work — while arbitrary batches produce five brown ovals drawn weeks apart.

## Habitat balance

| habitat   | now     | plan adds | after   |
| --------- | ------- | --------- | ------- |
| forest    | 25      | 38        | 63      |
| meadow    | 43      | 32        | 75      |
| water     | 24      | 43        | 67      |
| sky       | 9       | 38        | 47      |
| mythic    | 7       | 41        | 48      |
| **total** | **108** | **192**   | **300** |

Spread tightens from 7–43 (a 6× ratio) to 47–75 (about 1.6×). Habitat
assignments are **not** frozen — `habitat.ts` says so — so they can be re-tuned later.
The names are what cannot be taken back.

## Review pass

62 names were cut and replaced. Menagerie is a connection app, so a creature
name is something a person wears; anything that reads as an insult, a parasite, or a
warning label does not belong, however accurate the zoology.

### Cut for tone (31)

| name        | why                                                                             |
| ----------- | ------------------------------------------------------------------------------- |
| `jackal`    | treachery                                                                       |
| `shrew`     | a sexist insult                                                                 |
| `muskrat`   | musk + rat                                                                      |
| `warthog`   | named for its warts                                                             |
| `possum`    | playing dead and roadkill                                                       |
| `catfish`   | "catfishing" is online-dating deception — the worst possible creature name here |
| `urchin`    | spiky, and a word for a street child                                            |
| `oyster`    | a faceless shell, and the slang                                                 |
| `barnacle`  | "clingy" is the whole connotation                                               |
| `limpet`    | the literal idiom for clingy                                                    |
| `abalone`   | a faceless shell                                                                |
| `loon`      | "loon" = crazy                                                                  |
| `buzzard`   | an insult                                                                       |
| `vulture`   | predatory opportunist                                                           |
| `thrush`    | also a medical condition                                                        |
| `grouse`    | "grouse" = to complain                                                          |
| `crane`     | reads as construction equipment                                                 |
| `monitor`   | reads as a computer screen                                                      |
| `toad`      | an insult, and warty                                                            |
| `moth`      | drab beside the existing butterfly; "moth-eaten"                                |
| `wasp`      | aggressive, and the acronym                                                     |
| `hornet`    | aggressive                                                                      |
| `mantis`    | eats its mate                                                                   |
| `locust`    | plague                                                                          |
| `centipede` | creepy                                                                          |
| `troll`     | an internet troll                                                               |
| `ogre`      | an insult                                                                       |
| `wraith`    | grim                                                                            |
| `satyr`     | lechery — wrong signal next to a desires section                                |
| `harpy`     | a sexist insult                                                                 |
| `gargoyle`  | an insult for someone ugly                                                      |

### Cut as duplicates or indistinct (31)

| name        | why                                   |
| ----------- | ------------------------------------- |
| `serval`    | ≈ ocelot                              |
| `bobcat`    | ≈ lynx                                |
| `weasel`    | ≈ ferret                              |
| `stoat`     | ≈ ferret                              |
| `mink`      | ≈ marten                              |
| `polecat`   | ≈ ferret                              |
| `baboon`    | ≈ mandrill, which is more distinct    |
| `antelope`  | the category gazelle/oryx/kudu are in |
| `alpaca`    | ≈ existing llama                      |
| `dugong`    | ≈ manatee                             |
| `carp`      | "carp" = to complain                  |
| `perch`     | plain fish, and a verb                |
| `herring`   | plain fish, "red herring"             |
| `barracuda` | ≈ marlin                              |
| `egret`     | ≈ heron                               |
| `mallard`   | ≈ existing duck                       |
| `nuthatch`  | ≈ every other small perching bird     |
| `chickadee` | ≈ every other small perching bird     |
| `warbler`   | ≈ every other small perching bird     |
| `bunting`   | ≈ every other small perching bird     |
| `rook`      | ≈ raven                               |
| `waxwing`   | ≈ every other small perching bird     |
| `wagtail`   | ≈ every other small perching bird     |
| `emu`       | ≈ ostrich                             |
| `partridge` | ≈ quail                               |
| `boa`       | ≈ python                              |
| `mamba`     | ≈ cobra                               |
| `tortoise`  | ≈ existing turtle                     |
| `gharial`   | ≈ existing crocodile                  |
| `caiman`    | ≈ existing crocodile                  |
| `cicada`    | ≈ beetle at this size                 |

Replacements were chosen to be warm, visually distinct and drawable, and weighted
toward `sky` and `mythic` — still the thin habitats. `lovebird`,
`nightingale` and `bluebird` are deliberate: this is an app about finding people.

## Draw order

Each group is one drawing batch, ordered so the shared-template families come first
and the one-offs last.

### 1. Wild cats (5)

- **forest** — `lynx` · `ocelot` · `puma`
- **meadow** — `caracal` · `cheetah`

### 2. Wild canids (4)

- **meadow** — `coyote` · `dingo` · `hyena` · `fennec`

### 3. Mustelids & small carnivores (10)

- **forest** — `marten` · `wolverine` · `ferret` · `coati` · `kinkajou` · `ringtail` · `fossa` · `binturong`
- **meadow** — `mongoose` · `meerkat`

### 4. Rodents & burrowers (11)

- **forest** — `chipmunk` · `mole` · `porcupine` · `agouti`
- **meadow** — `marmot` · `gopher` · `jerboa` · `chinchilla` · `pika` · `hyrax`
- **water** — `capybara`

### 5. Primates (10)

- **forest** — `lemur` · `gibbon` · `tarsier` · `mandrill` · `chimp` · `tamarin` · `galago` · `colobus` · `sifaka` · `indri`

### 6. Hoofed & horned (11)

- **forest** — `tapir` · `okapi`
- **meadow** — `gazelle` · `kudu` · `oryx` · `ibex` · `yak` · `wallaby` · `springbok` · `markhor` · `saiga`

### 7. Odd mammals (8)

- **forest** — `pangolin` · `anteater` · `echidna` · `wombat` · `quokka`
- **meadow** — `armadillo` · `aardvark`
- **water** — `platypus`

### 8. Marine mammals (6)

- **water** — `walrus` · `narwhal` · `orca` · `beluga` · `manatee` · `sealion`

### 9. Fish (17)

- **water** — `trout` · `salmon` · `koi` · `pike` · `eel` · `marlin` · `tuna` · `seahorse` · `stingray` · `betta` · `discus` · `wrasse` · `lionfish` · `sailfish` · `manta` · `seadragon` · `sunfish`

### 10. Marine invertebrates (3)

- **water** — `starfish` · `anemone` · `cuttlefish`

### 11. Water birds (13)

- **water** — `heron` · `pelican` · `puffin` · `kingfisher` · `cormorant` · `ibis` · `tern` · `stork` · `dipper` · `avocet` · `plover` · `sandpiper` · `curlew`

### 12. Raptors (7)

- **sky** — `falcon` · `osprey` · `kestrel` · `harrier` · `goshawk` · `condor` · `caracara`

### 13. Songbirds & perching (29)

- **sky** — `robin` · `sparrow` · `raven` · `magpie` · `starling` · `wren` · `finch` · `lark` · `oriole` · `swallow` · `canary` · `budgie` · `lorikeet` · `kookaburra` · `hoopoe` · `jay` · `shrike` · `lovebird` · `nightingale` · `bluebird` · `goldfinch` · `quetzal` · `hornbill` · `cockatiel` · `parakeet` · `sunbird` · `tanager` · `macaw` · `honeyeater`

### 14. Ground birds & ratites (4)

- **forest** — `kiwi`
- **meadow** — `pheasant` · `ostrich` · `quail`

### 15. Reptiles (5)

- **forest** — `iguana` · `chameleon` · `python`
- **meadow** — `cobra` · `viper`

### 16. Amphibians (4)

- **forest** — `salamander` · `treefrog`
- **water** — `axolotl` · `newt`

### 17. Insects & arachnids (4)

- **meadow** — `bumblebee` · `grasshopper`
- **sky** — `dragonfly` · `firefly`

### 18. Mythic (41)

- **mythic** — `griffin` · `phoenix` · `kraken` · `chimera` · `pegasus` · `hydra` · `sphinx` · `yeti` · `kelpie` · `basilisk` · `minotaur` · `centaur` · `siren` · `golem` · `djinn` · `roc` · `thunderbird` · `selkie` · `manticore` · `leviathan` · `jackalope` · `kitsune` · `tanuki` · `faun` · `nymph` · `dryad` · `sylph` · `drake` · `wyrm` · `hippogriff` · `kirin` · `garuda` · `naga` · `valkyrie` · `seraph` · `cherub` · `titan` · `behemoth` · `peryton` · `alicorn` · `simurgh`

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

## Still watch these

- The wild-cat group is the hardest to keep distinct at 16×16 and may need trimming
  once drawn — `lynx`, `caracal`, `ocelot`, `puma` and `cheetah` sit beside
  the existing `tiger`, `lion`, `leopard`, `jaguar`, `cat` and `tabby`.
- The mythic set has no reference to work from, so expect the most revision there.
- `hyena` and `eel` were kept despite mild connotations (scavenger, "slippery").
  Both are charismatic and draw well; say the word if you disagree.
