// Tail wordlists for the view phrase's SECRET half: two compound adjectives
// and a compound place — `mistwoven-emberlit-fernhollow`. Each list is
// generated as base × suffix (128 × 32 = 4,096), so the tail carries exactly
// 12 + 12 + 12 = 36 bits while only ~320 morphemes need curating.
//
// FROZEN: order and content are part of every minted credential (indexes
// aren't stored, but membership drives phrase validation, and the guard spec
// pins a digest of the exact expansion). Append-only forever; never reorder,
// never remove. Grown 64 → 128 bases per side; the guard spec pins BOTH the
// new full digests and the old digests of the first 2,048 entries, which is
// the mechanical proof that the growth was a pure append.
//
// TAIL SECRECY (revised): the tail words are never *displayed* and never
// derived into anything a phrase-less viewer can see. Exactly one coarse
// projection is published: the place word's landform FAMILY (1 of 12,
// ~3.55 bits), and only to viewers who already hold the phrase. Never a base,
// never an adjective, never the suffix itself — only which family it falls in.
// All within-family visual variation derives from the PUBLIC head words, so it
// leaks nothing further. See place-family.ts for the map and the bit ledger in
// hatch/phrases.ts. Any new tail-derived UI requires the same accounting,
// written down.

const ADJ_BASES = [
  'mist', 'moon', 'star', 'sun', 'dawn', 'dusk', 'ember', 'frost',
  'storm', 'tide', 'wind', 'rain', 'snow', 'cloud', 'shadow', 'dream',
  'night', 'sky', 'sea', 'leaf', 'thorn', 'petal', 'fern', 'moss',
  'ivy', 'oak', 'willow', 'cedar', 'river', 'stone', 'flint', 'iron',
  'silver', 'gold', 'copper', 'amber', 'opal', 'pearl', 'coral', 'crystal',
  'honey', 'spice', 'salt', 'smoke', 'ash', 'flame', 'spark', 'glow',
  'wave', 'dew', 'fog', 'thunder', 'winter', 'summer', 'autumn', 'spring',
  'meadow', 'ocean', 'garden', 'lantern', 'velvet', 'marble', 'raven', 'wolf',
  // --- appended (64 → 128) ---
  'aurora', 'birch', 'bloom', 'bramble', 'breeze', 'briar', 'brook', 'candle',
  'cinder', 'clover', 'comet', 'crescent', 'dapple', 'drift', 'dune', 'echo',
  'elder', 'fable', 'feather', 'fire', 'fjord', 'flax', 'forest', 'frond',
  'glade', 'glass', 'grove', 'harbor', 'haze', 'hearth', 'heather', 'holly',
  'hush', 'juniper', 'kelp', 'lace', 'lark', 'laurel', 'lichen', 'lily',
  'linen', 'lotus', 'maple', 'mire', 'myrrh', 'nectar', 'nettle', 'orchid',
  'pine', 'quartz', 'quill', 'reed', 'rose', 'rowan', 'rune', 'sable',
  'saffron', 'sorrel', 'tansy', 'thistle', 'twilight', 'vesper', 'wisp', 'yarrow',
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
  // --- appended (64 → 128) ---
  'amber', 'anise', 'apple', 'arbor', 'ash', 'aster', 'barley', 'bay',
  'beech', 'bell', 'bracken', 'bristle', 'bronze', 'buckthorn', 'burdock', 'calla',
  'candle', 'cattail', 'chervil', 'cinnamon', 'cobble', 'comfrey', 'cypress', 'daffodil',
  'daisy', 'damson', 'dogwood', 'elder', 'elm', 'fennel', 'fescue', 'fir',
  'flax', 'foxglove', 'gorse', 'hawthorn', 'hemlock', 'hickory', 'honey', 'ironwood',
  'ivy', 'jasmine', 'larch', 'lark', 'lavender', 'linden', 'lupine', 'magnolia',
  'mallow', 'marigold', 'mulberry', 'oak', 'poppy', 'primrose', 'quince', 'rosemary',
  'sedge', 'spruce', 'sumac', 'sycamore', 'teasel', 'thyme', 'vervain', 'yew',
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

/** 4,096 compound adjectives: mistwoven, emberlit, wolfsworn… (12 bits). */
export const TAIL_ADJECTIVES = expand(ADJ_BASES, ADJ_SUFFIXES);

/** 4,096 compound places: fernhollow, moonvale, glimmershore… (12 bits). */
export const TAIL_PLACES = expand(PLACE_BASES, PLACE_SUFFIXES);

/** Exposed for the guard spec and place-family.ts's suffix→family map only. */
export const TAIL_MORPHEMES = { ADJ_BASES, ADJ_SUFFIXES, PLACE_BASES, PLACE_SUFFIXES } as const;
