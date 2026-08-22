// Persona wordlists and colors.
//
// COMPATIBILITY CONTRACT: indexes 0..63 (and colors 0..15) are FROZEN once
// shipped — a persona derives deterministically from a seed carried in share
// links, so reordering or replacing entries would silently rename everyone's
// creature. Appending is meaningless (indexes above 63 are unreachable);
// fixing a typo in place is the only acceptable edit, and only if the word
// stays recognizably the same. persona.spec.ts pins a frozen fixture.

/** 64 entries — first adjective slot. */
export const ADJECTIVES_A: readonly string[] = [
  'amber', 'brave', 'calm', 'clever', 'cosmic', 'crisp', 'daring', 'deft',
  'dusky', 'eager', 'fabled', 'fierce', 'gentle', 'gilded', 'golden', 'happy',
  'hardy', 'hidden', 'humble', 'jolly', 'keen', 'kind', 'lively', 'loyal',
  'lucid', 'lunar', 'mellow', 'merry', 'mighty', 'misty', 'noble', 'nimble',
  'opal', 'plucky', 'proud', 'quiet', 'quick', 'radiant', 'rustic', 'sable',
  'sage', 'sandy', 'silent', 'silver', 'sleek', 'solar', 'spry', 'stellar',
  'stoic', 'sunny', 'swift', 'tidal', 'tranquil', 'true', 'velvet', 'vivid',
  'wandering', 'warm', 'wild', 'winter', 'witty', 'zealous', 'zesty', 'bold',
];

/** 64 entries — second adjective slot (distinct list: no "brave-brave"). */
export const ADJECTIVES_B: readonly string[] = [
  'azure', 'blazing', 'breezy', 'bright', 'bubbly', 'candid', 'cheerful', 'chill',
  'coral', 'cozy', 'crimson', 'curious', 'dapper', 'dreamy', 'electric', 'emerald',
  'feathered', 'festive', 'floral', 'frosty', 'fuzzy', 'glowing', 'graceful', 'groovy',
  'honeyed', 'indigo', 'jade', 'jaunty', 'lavender', 'lemony', 'limber', 'maroon',
  'mango', 'marble', 'midnight', 'minty', 'mossy', 'ochre', 'olive', 'onyx',
  'peachy', 'pearly', 'peppy', 'perky', 'plum', 'prancing', 'rosy', 'ruby',
  'saffron', 'sapphire', 'scarlet', 'snappy', 'snowy', 'sparkling', 'spiffy', 'spotted',
  'starry', 'striped', 'tangy', 'twilight', 'umber', 'verdant', 'violet', 'wavy',
];

export interface AnimalEntry {
  readonly name: string;
  readonly emoji: string;
}

/** 64 entries, each with a single-codepoint-friendly emoji (no VS16 sequences). */
export const ANIMALS: readonly AnimalEntry[] = [
  { name: 'fox', emoji: '🦊' }, { name: 'otter', emoji: '🦦' },
  { name: 'owl', emoji: '🦉' }, { name: 'wolf', emoji: '🐺' },
  { name: 'bear', emoji: '🐻' }, { name: 'panda', emoji: '🐼' },
  { name: 'koala', emoji: '🐨' }, { name: 'tiger', emoji: '🐯' },
  { name: 'lion', emoji: '🦁' }, { name: 'cat', emoji: '🐱' },
  { name: 'dog', emoji: '🐶' }, { name: 'rabbit', emoji: '🐰' },
  { name: 'hamster', emoji: '🐹' }, { name: 'mouse', emoji: '🐭' },
  { name: 'hedgehog', emoji: '🦔' }, { name: 'bat', emoji: '🦇' },
  { name: 'frog', emoji: '🐸' }, { name: 'turtle', emoji: '🐢' },
  { name: 'gecko', emoji: '🦎' }, { name: 'octopus', emoji: '🐙' },
  { name: 'squid', emoji: '🦑' }, { name: 'shrimp', emoji: '🦐' },
  { name: 'crab', emoji: '🦀' }, { name: 'lobster', emoji: '🦞' },
  { name: 'pufferfish', emoji: '🐡' }, { name: 'fish', emoji: '🐠' },
  { name: 'dolphin', emoji: '🐬' }, { name: 'whale', emoji: '🐳' },
  { name: 'shark', emoji: '🦈' }, { name: 'seal', emoji: '🦭' },
  { name: 'penguin', emoji: '🐧' }, { name: 'duck', emoji: '🦆' },
  { name: 'swan', emoji: '🦢' }, { name: 'eagle', emoji: '🦅' },
  { name: 'parrot', emoji: '🦜' }, { name: 'flamingo', emoji: '🦩' },
  { name: 'peacock', emoji: '🦚' }, { name: 'rooster', emoji: '🐓' },
  { name: 'chick', emoji: '🐤' }, { name: 'butterfly', emoji: '🦋' },
  { name: 'bee', emoji: '🐝' }, { name: 'ladybug', emoji: '🐞' },
  { name: 'snail', emoji: '🐌' }, { name: 'unicorn', emoji: '🦄' },
  { name: 'dragon', emoji: '🐉' }, { name: 'horse', emoji: '🐴' },
  { name: 'zebra', emoji: '🦓' }, { name: 'deer', emoji: '🦌' },
  { name: 'giraffe', emoji: '🦒' }, { name: 'elephant', emoji: '🐘' },
  { name: 'rhino', emoji: '🦏' }, { name: 'hippo', emoji: '🦛' },
  { name: 'camel', emoji: '🐪' }, { name: 'llama', emoji: '🦙' },
  { name: 'sloth', emoji: '🦥' }, { name: 'kangaroo', emoji: '🦘' },
  { name: 'badger', emoji: '🦡' }, { name: 'beaver', emoji: '🦫' },
  { name: 'skunk', emoji: '🦨' }, { name: 'raccoon', emoji: '🦝' },
  { name: 'monkey', emoji: '🐵' }, { name: 'gorilla', emoji: '🦍' },
  { name: 'goat', emoji: '🐐' }, { name: 'sheep', emoji: '🐑' },
];

/**
 * 16 deep hues, precomputed dark for QR scanability: every entry must keep
 * WCAG relative luminance ≤ 0.20 (asserted in persona.spec.ts), i.e. contrast
 * against white ≥ 4.2:1.
 */
export const PERSONA_COLORS: readonly string[] = [
  '#8b2f5c', // berry
  '#2f6b4f', // pine
  '#1c5cab', // cobalt
  '#8a4b16', // amber
  '#5b3aa7', // violet
  '#a03535', // brick
  '#0f766e', // teal
  '#756215', // olive
  '#9c3d00', // burnt orange
  '#386641', // moss
  '#7b2d8b', // plum
  '#0b5e8a', // ocean
  '#99424f', // rosewood
  '#4a5568', // slate
  '#1d3557', // navy
  '#6d597a', // mauve
];
