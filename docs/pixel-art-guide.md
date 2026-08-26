# Drawing the menagerie

How a Menagerie creature sprite is made, and the rules that keep 300 of them
looking like one set. The sprites live in `libs/ui/src/creatures/pixel-grids.ts`;
the names and batch order live in [`animal-plan.md`](./animal-plan.md).

## The format

A sprite is 16 rows of 16 letters plus a palette mapping each letter to a hex
colour. `.` is transparent. Nothing else is allowed — `pixel-art.spec.ts`
enforces the shape, the palette, and the letter vocabulary below.

```ts
otter: {
  palette: { o: OUT, a: BRN, b: CRM, k: INK, w: WHT },
  rows: [ /* 16 strings of 16 chars */ ],
},
```

### The letter vocabulary

| letter | means        | notes                                       |
| ------ | ------------ | ------------------------------------------- |
| `o`    | outline      | every creature has one; almost always `OUT` |
| `a`    | primary fill | the body colour                             |
| `b`    | secondary    | muzzle, belly, cheek patch                  |
| `c`    | accent       | comb, crest, fin — the one loud detail      |
| `m`    | marking      | stripes and spots                           |
| `p`    | pink         | nose, inner ear, tongue                     |
| `y`    | keratin      | beak, horn, tusk, talon                     |
| `k`    | ink          | pupils                                      |
| `w`    | white        | eye whites and highlights                   |

The vocabulary is shared **on purpose**: it is what lets one sprite's grid be
read and edited by someone who has only ever looked at another. A batch that
invents its own letter breaks that, and the spec will fail it. Palette colours
come from the shared pots at the top of the file (`OUT`, `CRM`, `RST`, …) —
add a new pot only when no existing one is close.

## The framing

Creatures are **head-and-shoulders portraits**, not full bodies, and they face
the viewer. That is the single strongest reason the set coheres: at 16×16 a
whole animal becomes an unreadable smudge, while a face survives.

Exceptions are the animals that have no front-facing face worth drawing — fish,
whales, snails, snakes — which are drawn side-on. Keep those genuinely rare;
each one costs the set a little unity.

The eyes are the convention that makes a grid read as a _creature_ rather than
an object: `kk` for the pupil with a `w` highlight above-left, at rows 5–8.
`nautilus` is the only eyeless sprite and is named as an exception in the spec.

## The shared heads

Three templates carry most of the mammals. Reuse is not laziness — `fox` and
`wolf` are the same grid with different palettes, and that is why they look
like siblings.

| template   | used by                 | shape                         |
| ---------- | ----------------------- | ----------------------------- |
| `CANINE`   | fox, wolf, and the dogs | pointy ears, wide muzzle      |
| `ROUND`    | bears, koala, panda     | round ears, centred muzzle    |
| `LONGFACE` | the hoofed crowd        | tall narrow face, long muzzle |

Templates still to be built, each in the batch that first needs one:

| template   | first needed | shape                                        |
| ---------- | ------------ | -------------------------------------------- |
| `PERCH`    | batch 6      | round body, small triangular beak, tail stub |
| `RAPTOR`   | batch 5      | hooked beak, heavy brow ridge                |
| `WADER`    | batch 5      | long bill, slim neck                         |
| `FISHBODY` | batch 4      | side-on teardrop, tail fin left              |
| `SERPENT`  | batch 7      | coil below a front-facing head               |
| `BUGBODY`  | batch 7      | thorax, antennae, wing case                  |

Build the template **first**, draw two members with it, look at them together,
and only then do the rest of the group. A template that produces two
indistinguishable animals is the wrong template.

## What drawing the first 44 taught me

These are the mistakes that actually happened, in order of how often:

- **Asymmetry reads as damage.** Ears built with different left and right runs
  looked chewed, not characterful. Mirror the halves unless the asymmetry is
  the point.
- **A marking under 2px vanishes.** The first leopard's spots were single
  pixels and rendered as noise; they had to become `m`-pairs before they read
  as rosettes.
- **Low contrast turns into mush.** The first poodle was cream on cream and
  read as a blob. It took a darker `b` and three passes.
- **Silhouette beats detail.** The mammoth failed twice while I fussed over
  shading; it worked the moment the tusks broke the outline. Ask what shape
  says the animal, then spend pixels there.
- **Pure white shapes vanish.** The colobus's white mantle rendered as
  nothing at all on the light surface these sprites sit on, and would have
  disappeared inside the QR badge too. White is safe for eye highlights, which
  sit inside a dark pupil; for anything with an exposed edge, tint it (`GRL`)
  or give it its own `o` outline.
- **A side-on body is much harder than a face.** Eight of the 26 aquatic
  sprites failed their first cut against roughly one in five elsewhere. A face
  has landmarks that survive at 16px; a fish is a silhouette plus one feature,
  and the silhouette has to do nearly all of it.
- **A diagonal of single pixels reads as a zipper, not a curve.** The ibis's
  down-curved bill needed two-pixel steps before it read as one line.
- **Adding detail to a failing sprite usually makes it worse.** The pheasant
  and ostrich each got a pass that added colour and both got harder to read;
  what fixed them was taking things away — a red patch per eye instead of a
  red face, and no neck at all.
- **Two similar species need one deliberate difference each.** `hound`,
  `retriever` and `poodle` share a head; they are told apart by ear length,
  ear colour, and a topknot. Decide that difference before drawing, not after.

## The loop

```sh
# 1. write grids into pixel-grids.ts
npm run sprites -- --only=lynx,caracal,ocelot   # 2. render just what you drew
#    ...open the HTML, LOOK at it, re-cut what does not read
npm run test:ui                                  # 3. shape, palette, vocabulary
npm run sprites -- --new                         # 4. what is still undrawn (red cards)
npm run build && npm run e2e                     # 5. before committing
```

Step 2 is not optional and cannot be skipped by reading the letters. Every
sprite in the menagerie was rendered and looked at, and roughly one in six was
re-cut afterwards.

## Batches

192 creatures in 8 batches, grouped so each one shares a template and can be
judged as a family. Sizes are deliberately uneven — a batch is a _visual
register_, not a fixed count.

| #   | batch                                 | n   | brings                               |
| --- | ------------------------------------- | --- | ------------------------------------ |
| 1   | Wild cats · canids · mustelids        | 19  | reuses `CANINE`, `ROUND`             |
| 2   | Rodents · odd mammals                 | 19  | reuses `ROUND`                       |
| 3   | Hoofed · primates                     | 21  | reuses `LONGFACE`                    |
| 4   | Marine mammals · fish · invertebrates | 26  | `FISHBODY`                           |
| 5   | Water birds · raptors · ground birds  | 24  | `RAPTOR`, `WADER`                    |
| 6   | Songbirds & perching                  | 29  | `PERCH`                              |
| 7   | Reptiles · amphibians · insects       | 13  | `SERPENT`, `BUGBODY`                 |
| 8   | Mythic                                | 41  | one-offs; split into two if it drags |

Each batch is one commit and must leave the ladder green. Names enter
`ANIMALS` only with their sprite, so a half-finished batch never ships.

## Before batch 1

`persona.spec.ts` asserts every animal has a unique single-codepoint emoji, and
that supply is exhausted at 108. Emoji has to become optional first — see the
end of [`animal-plan.md`](./animal-plan.md). Nothing can be added until then.
