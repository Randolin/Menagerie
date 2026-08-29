/**
 * The message layer for copy that lives in the domain, not in a template.
 *
 * Angular has a perfectly good i18n mechanism and the app uses it — but it
 * cannot reach here. `libs/core` may not import a framework (no-angular.spec
 * fails the build otherwise), and `$localize` comes from `@angular/localize`.
 * The survey schema is more than half of everything this product says to a
 * person, so "translate Menagerie" is impossible until that copy has a way
 * out. This is that way out, and it is deliberately about twenty lines:
 *
 * - Source text stays exactly where it is, in `schema/sections.ts`, readable
 *   as English. Nothing in the frozen file changes, and the source doubles as
 *   the fallback, so a missing or partial translation degrades to English one
 *   string at a time rather than failing.
 * - Keys are derived from the schema's own permanent identifiers — item ids
 *   and option indexes — which `schema.spec.ts` already freezes against
 *   `schema-v2.freeze.json`. That is not a convenience: it means a
 *   translation cannot be silently invalidated by a schema edit, because the
 *   only edits the freeze allows (relabelling, appending) are exactly the
 *   ones that leave existing keys meaning what they meant.
 *
 * Loading is the app's job — this module has no opinion about where a bag
 * comes from, which is what keeps it framework-free and testable.
 */
export type MessageBag = Readonly<Record<string, string>>;

let active: MessageBag = {};

/** Replace the active translations wholesale. Empty bag = source English. */
export function loadMessages(bag: MessageBag): void {
  active = bag;
}

/** Back to source English — the app's "switch to the default locale". */
export function clearMessages(): void {
  active = {};
}

/**
 * The translation for `key`, or `source` when there isn't one.
 *
 * An empty translation counts as absent: a catalogue row someone has not
 * filled in yet must show English, never a blank label.
 */
export function message(key: string, source: string): string {
  const found = active[key];
  return found ? found : source;
}
