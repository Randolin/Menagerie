// Tail wordlists for the view phrase's SECRET half: two compound adjectives
// and a compound place — `mistwoven-emberlit-fernhollow`. Each list is
// generated as base × suffix (64 × 32 = 2,048), so the tail carries exactly
// 11 + 11 + 11 = 33 bits while only ~190 morphemes need curating.
//
// FROZEN: order and content are part of every minted credential (indexes
// aren't stored, but membership drives phrase validation, and the guard spec
// pins a digest of the exact expansion). Append-only forever; never reorder,
// never remove. These words are handled as secrets — they must never be
// displayed, themed, or derived into any UI (the public creature identity
// lives in wordlists.ts; a future habitat banner derives from the HEAD).

const ADJ_BASES = [
  'mist', 'moon', 'star', 'sun', 'dawn', 'dusk', 'ember', 'frost',
  'storm', 'tide', 'wind', 'rain', 'snow', 'cloud', 'shadow', 'dream',
  'night', 'sky', 'sea', 'leaf', 'thorn', 'petal', 'fern', 'moss',
  'ivy', 'oak', 'willow', 'cedar', 'river', 'stone', 'flint', 'iron',
  'silver', 'gold', 'copper', 'amber', 'opal', 'pearl', 'coral', 'crystal',
  'honey', 'spice', 'salt', 'smoke', 'ash', 'flame', 'spark', 'glow',
  'wave', 'dew', 'fog', 'thunder', 'winter', 'summer', 'autumn', 'spring',
  'meadow', 'ocean', 'garden', 'lantern', 'velvet', 'marble', 'raven', 'wolf',
] as const;

const ADJ_SUFFIXES = [
  'lit', 'worn', 'born', 'bound', 'woven', 'kissed', 'touched', 'swept',
  'laced', 'veiled', 'crowned', 'struck', 'forged', 'spun', 'cast', 'carved',
  'etched', 'gilded', 'washed', 'wrapped', 'marked', 'blessed', 'charmed', 'dusted',
  'feathered', 'haunted', 'mantled', 'painted', 'tempered', 'threaded', 'warmed', 'sworn',
] as const;

const PLACE_BASES = [
  'fern', 'moon', 'mist', 'briar', 'bramble', 'cinder', 'clover', 'coral',
  'dew', 'drift', 'echo', 'ember', 'fable', 'feather', 'fog', 'frost',
  'glimmer', 'hazel', 'heather', 'holly', 'lantern', 'laurel', 'lichen', 'marble',
  'myrtle', 'nettle', 'otter', 'owl', 'pebble', 'pine', 'quill', 'raven',
  'reed', 'rose', 'rowan', 'saffron', 'sage', 'shadow', 'silver', 'sorrel',
  'spindle', 'starling', 'stone', 'swallow', 'tansy', 'thistle', 'timber', 'tumble',
  'velvet', 'violet', 'walnut', 'whisper', 'wild', 'willow', 'winter', 'wren',
  'yarrow', 'alder', 'aspen', 'birch', 'cedar', 'chestnut', 'juniper', 'maple',
] as const;

const PLACE_SUFFIXES = [
  'vale', 'hollow', 'glen', 'ridge', 'cove', 'marsh', 'grove', 'moor',
  'fen', 'heath', 'shore', 'cliff', 'wood', 'field', 'brook', 'pond',
  'gate', 'bridge', 'tower', 'keep', 'hall', 'garden', 'orchard', 'haven',
  'hearth', 'well', 'spire', 'den', 'burrow', 'reach', 'rest', 'landing',
] as const;

function expand(bases: readonly string[], suffixes: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const base of bases) for (const suffix of suffixes) out.push(base + suffix);
  return out;
}

/** 2,048 compound adjectives: mistwoven, emberlit, wolfsworn… (11 bits). */
export const TAIL_ADJECTIVES = expand(ADJ_BASES, ADJ_SUFFIXES);

/** 2,048 compound places: fernhollow, moonvale, glimmershore… (11 bits). */
export const TAIL_PLACES = expand(PLACE_BASES, PLACE_SUFFIXES);

/** Exposed for the guard spec only. */
export const TAIL_MORPHEMES = { ADJ_BASES, ADJ_SUFFIXES, PLACE_BASES, PLACE_SUFFIXES } as const;
