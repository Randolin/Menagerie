// Conditional depth items — questions that only make sense once earlier
// answers say they do.
//
// This used to live on packs (`Pack.condition`), which gated a whole themed
// run. Packs are gone: the profile is now edited as one card per section, so
// the gate had to move down to the items it actually protects. That turned out
// to be a much smaller thing than it looked — one predicate over three items.
//
// The point is not secrecy, it is not asking a monogamous person how they
// handle compersion. A gated item is simply not offered until the condition
// holds; if it somehow already carries an answer it stays visible, so nobody's
// existing answer becomes invisible-but-stored.
import type { Answers, ItemId, Item, Section } from './types';

/**
 * Positive interest (1..3) in any non-monogamous connection type, or a
 * non-monogamous structure selected, opens the ENM depth questions.
 */
export function leansOpen(answers: Answers): boolean {
  const NONMONO_INTERESTS = ['sk.poly', 'sk.open', 'sk.swing', 'sk.ra'];
  for (const id of NONMONO_INTERESTS) {
    const v = answers[id];
    if (typeof v === 'number' && v >= 1) return true;
  }
  // st.ideal option indexes 1..6 are the non-monogamy structures
  // (Monogamish … Swinging / play partners); 0/7/8 are not signals.
  const ideal = answers['st.ideal'];
  if (Array.isArray(ideal)) return ideal.some((i) => i >= 1 && i <= 6);
  return false;
}

/** Item id → the predicate that must hold before the item is offered. */
const GATES: Readonly<Record<ItemId, (answers: Answers) => boolean>> = {
  'st.compersion': leansOpen,
  'st.jealousy': leansOpen,
  'st.autonomy': leansOpen,
};

/** Ids that are gated at all — exposed so the guard spec can pin the set. */
export const GATED_ITEM_IDS: readonly ItemId[] = Object.keys(GATES);

/**
 * True when an item should be offered. An item that already has an answer is
 * always shown: hiding a stored answer would make it uneditable while it kept
 * counting toward the profile.
 */
export function isItemOffered(id: ItemId, answers: Answers): boolean {
  const gate = GATES[id];
  if (!gate) return true;
  if (answers[id] !== undefined) return true;
  return gate(answers);
}

/** The items of a section that should be shown, in schema order. */
export function offeredItems(section: Section, answers: Answers): Item[] {
  return section.items.filter((item) => isItemOffered(item.id, answers));
}
