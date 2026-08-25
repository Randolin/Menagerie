// Second accent hue per ADJECTIVES_B word — the color-word slot of the
// creature name made literal: an `azure-…` creature carries a deep azure,
// a `crimson-…` a deep crimson. Non-color words get a hue in their spirit.
//
// COMPATIBILITY CONTRACT: index-aligned with ADJECTIVES_B and FROZEN once
// shipped, exactly like PERSONA_COLORS — the hue is visible creature
// identity (the QR gradient's second stop), so recoloring an index silently
// "repaints" everyone's creature. In-place tweaks only if the hue stays
// recognizably the same.
//
// Every entry is precomputed dark for QR scanability: WCAG relative
// luminance ≤ 0.20 (asserted in adjb-hues.spec.ts), the same bound as
// PERSONA_COLORS, so any gradient between the two stays scannable on white.
import { ADJECTIVES_B } from './wordlists';

/** 128 entries — hue for the same index in ADJECTIVES_B (lockstep asserted). */
export const ADJ_B_HUES: readonly string[] = [
  '#1e5f9e', // azure
  '#a63c10', // blazing
  '#3a7d74', // breezy
  '#946a00', // bright
  '#a04a78', // bubbly
  '#4a5568', // candid
  '#b3541e', // cheerful
  '#2a6b8f', // chill
  '#b04a3a', // coral
  '#7a4a21', // cozy
  '#8f1f33', // crimson
  '#6135a0', // curious
  '#2f3a56', // dapper
  '#6d5a9e', // dreamy
  '#1b6fc4', // electric
  '#0f7a4f', // emerald
  '#607180', // feathered
  '#a02a4a', // festive
  '#8a3f7c', // floral
  '#3f6a8a', // frosty
  '#7a5b3a', // fuzzy
  '#9a5a00', // glowing
  '#4f5a96', // graceful
  '#7b3f9e', // groovy
  '#8f6a12', // honeyed
  '#35358f', // indigo
  '#23755f', // jade
  '#0b7285', // jaunty
  '#7a5aae', // lavender
  '#7d7000', // lemony
  '#3f7d4a', // limber
  '#6e1f2e', // maroon
  '#a85a0f', // mango
  '#5d6470', // marble
  '#1c2440', // midnight
  '#2a8062', // minty
  '#4f6b2f', // mossy
  '#8a5f24', // ochre
  '#6b6b23', // olive
  '#26262b', // onyx
  '#b35a46', // peachy
  '#6e6a75', // pearly
  '#c23a52', // peppy
  '#b04a90', // perky
  '#6f2a80', // plum
  '#9e3a6b', // prancing
  '#ad3a56', // rosy
  '#9e1030', // ruby
  '#a0620a', // saffron
  '#14509e', // sapphire
  '#b32020', // scarlet
  '#5a7d00', // snappy
  '#5b6d7d', // snowy
  '#4a5ac4', // sparkling
  '#8a2f4f', // spiffy
  '#7a4f14', // spotted
  '#2a2a72', // starry
  '#444a52', // striped
  '#b04a00', // tangy
  '#4f3a7d', // twilight
  '#6e4423', // umber
  '#1f7a33', // verdant
  '#6a2fa0', // violet
  '#1f6e9e', // wavy
  // --- appended (64 → 128), index-aligned with ADJECTIVES_B ---
  '#6b6357', // alabaster
  '#6d5334', // almond
  '#6a3f9e', // amethyst
  '#a2541a', // apricot
  '#10756b', // aquamarine
  '#7a2f14', // auburn
  '#3c4247', // basalt
  '#2f6d5a', // beryl
  '#4a3728', // bistre
  '#7a4a1c', // bronze
  '#7a1f38', // burgundy
  '#12629e', // cerulean
  '#5a7a00', // chartreuse
  '#a01f34', // cherry
  '#4a2c1a', // chocolate
  '#a33418', // cinnabar
  '#7a6a0f', // citrine
  '#7d4a30', // clay
  '#14459e', // cobalt
  '#8a4718', // copper
  '#3f5cb8', // cornflower
  '#93203f', // cranberry
  '#5a2a5e', // damson
  '#2f4d75', // denim
  '#2b2b2b', // ebony
  '#7a6320', // flaxen
  '#8a1f2f', // garnet
  '#9c4a10', // ginger
  '#3a6d8a', // glacial
  '#40474d', // gunmetal
  '#6b4526', // hazelnut
  '#7a3a9e', // heliotrope
  '#4a3fa0', // iris
  '#6e6650', // ivory
  '#2f5a3a', // kelp
  '#16418f', // lapis
  '#7a4f9e', // lilac
  '#9c1f7a', // magenta
  '#6b2a1c', // mahogany
  '#106b47', // malachite
  '#7a5a80', // mauve
  '#6e2447', // mulberry
  '#8a6b0f', // mustard
  '#7a4726', // nutmeg
  '#23252b', // obsidian
  '#6b1420', // oxblood
  '#a33a14', // paprika
  '#4f5ab8', // periwinkle
  '#55595e', // pewter
  '#5a7a2a', // pistachio
  '#7a3a4a', // porphyry
  '#6b6068', // quartz
  '#8a3c18', // russet
  '#2f7a68', // seafoam
  '#5c4433', // sepia
  '#8a4520', // sienna
  '#46505f', // slate
  '#24523f', // spruce
  '#8a5a20', // tawny
  '#0f6b6b', // teal
  '#97401f', // terracotta
  '#8a6410', // topaz
  '#10707a', // turquoise
  '#ad3512', // vermilion
];

/** Hue for an ADJECTIVES_B word; null when the word isn't in the list. */
export function adjBHue(adjB: string): string | null {
  const index = ADJECTIVES_B.indexOf(adjB);
  return index >= 0 ? ADJ_B_HUES[index] : null;
}
