// Landform families — the ONE coarse projection of the view phrase's secret
// tail that is allowed to reach the screen.
//
// A place word is base + suffix (`fern` + `hollow`). The landform character
// lives entirely in the SUFFIX: `fernhollow`, `fernshore` and `fernburrow` are
// a sheltered lowland, a coast and a hole in the ground, and they have nothing
// visual in common. The base is a plant, animal or material — a tint on the
// idea, not the shape of the land. So the family partitions the 32 suffixes,
// and the 128 bases contribute nothing at all.
//
// WHAT THIS PUBLISHES, EXACTLY: which of 12 families the place word falls in.
// The partition is deliberately uneven-but-close (families hold 2–4 suffixes),
// giving H ≈ 3.55 bits out of the place word's 12. Nothing else about the tail
// is derivable from a rendered banner: not the base, not the suffix within its
// family, and not either tail adjective. Within-family variation is supplied
// by the PUBLIC head words (see banner.ts), so it costs zero additional bits.
//
// The 4,096-entry place list was grown from 2,048 in the same change that
// added this, buying +3 bits to pay for the ~3.55 spent here — effective tail
// secrecy ~32.45 bits vs 33.00 before. Full ledger in hatch/phrases.ts.
// Recompute it before deriving anything further from the tail.
import { TAIL_MORPHEMES, TAIL_PLACES } from './tail-wordlists';

export type PlaceFamily =
  | 'lowland'
  | 'wetland'
  | 'highland'
  | 'coastal'
  | 'woodland'
  | 'openland'
  | 'threshold'
  | 'stronghold'
  | 'underground'
  | 'hearthside'
  | 'spring'
  | 'tended';

export const PLACE_FAMILIES: readonly PlaceFamily[] = [
  'lowland',
  'wetland',
  'highland',
  'coastal',
  'woodland',
  'openland',
  'threshold',
  'stronghold',
  'underground',
  'hearthside',
  'spring',
  'tended',
];

/**
 * Family for the same index in TAIL_MORPHEMES.PLACE_SUFFIXES. Sizes are kept
 * within 2–4 so no family is a rare, highly-informative outcome; the balance
 * is asserted in place-family.spec.ts as a hard gate, since ~3.55 bits is an
 * AVERAGE and a 1-suffix family would leak far more than that when it hit.
 */
const SUFFIX_FAMILIES: readonly PlaceFamily[] = [
  'lowland', // vale
  'lowland', // hollow
  'lowland', // glen
  'highland', // ridge
  'coastal', // cove
  'wetland', // marsh
  'woodland', // grove
  'openland', // moor
  'wetland', // fen
  'openland', // heath
  'coastal', // shore
  'highland', // cliff
  'woodland', // wood
  'openland', // field
  'spring', // brook
  'wetland', // pond
  'threshold', // gate
  'threshold', // bridge
  'stronghold', // tower
  'stronghold', // keep
  'stronghold', // hall
  'tended', // garden
  'woodland', // orchard
  'tended', // haven
  'hearthside', // hearth
  'spring', // well
  'highland', // spire
  'underground', // den
  'underground', // burrow
  'openland', // reach
  'hearthside', // rest
  'coastal', // landing
];

export interface PlaceFamilyMeta {
  /**
   * Evocative, never decodable. Names the KIND of place, never a word that
   * could be in the phrase — "somewhere green and low", never "a fern hollow".
   * If a label ever names a base or a suffix, it publishes more than a family.
   */
  readonly label: string;
  /** Abstract motif for the banner. Depicts the family, never a base word. */
  readonly motif: string;
  /** Base tint; mixed against --surface at the CSS layer so themes both work. */
  readonly tint: string;
}

export const PLACE_FAMILY_META: Record<PlaceFamily, PlaceFamilyMeta> = {
  lowland: { label: 'somewhere green and sheltered', motif: '🌿', tint: '#5f9440' },
  wetland: { label: 'somewhere still and reedy', motif: '💧', tint: '#3f7d6e' },
  highland: { label: 'somewhere high and stony', motif: '⛰️', tint: '#6b7280' },
  coastal: { label: 'somewhere the water meets the land', motif: '🌊', tint: '#2f7da8' },
  woodland: { label: 'somewhere under branches', motif: '🌲', tint: '#1f5c46' },
  openland: { label: 'somewhere wide and windswept', motif: '🌾', tint: '#94793f' },
  threshold: { label: 'somewhere on the way through', motif: '🌉', tint: '#8560a8' },
  stronghold: { label: 'somewhere built to last', motif: '🏛️', tint: '#8a6f5a' },
  underground: { label: 'somewhere warm and hidden', motif: '🕳️', tint: '#4a3b46' },
  hearthside: { label: 'somewhere you can stop a while', motif: '🔥', tint: '#a8622f' },
  spring: { label: 'somewhere fresh water rises', motif: '💦', tint: '#3fa8b8' },
  tended: { label: 'somewhere someone cares for', motif: '🌸', tint: '#a3567f' },
};

/**
 * Built from TAIL_PLACES itself, so a word only resolves if it is genuinely in
 * the list. Deliberately NOT string prefix/suffix matching: `fernhollow` must
 * resolve because it is entry N, not because it ends in "hollow". Matching on
 * text would make the suffix independently readable off the word — and would
 * mis-resolve any base that happens to end in a suffix's letters.
 */
const FAMILY_BY_PLACE: ReadonlyMap<string, PlaceFamily> = new Map(
  TAIL_PLACES.map((word, i) => [word, SUFFIX_FAMILIES[i % TAIL_MORPHEMES.PLACE_SUFFIXES.length]]),
);

/** Family for a full tail place word; null when it isn't a real place word. */
export function placeFamilyOf(placeWord: string | null | undefined): PlaceFamily | null {
  if (!placeWord) return null;
  return FAMILY_BY_PLACE.get(placeWord.toLowerCase()) ?? null;
}

/** Exposed for the guard spec only. */
export const PLACE_SUFFIX_FAMILIES = SUFFIX_FAMILIES;
