/**
 * The editing modes a session offers, as data.
 *
 * Separate from the component that draws their icons so that a test, a layout or
 * a keyboard handler can name a mode without importing artwork — and so the
 * icons file exports components alone.
 *
 * The order is the order somebody meets them: what to make, how it is coloured,
 * whether it moves, the exact numbers, and finally the program itself. Nothing
 * downstream counts them — the tab bar, the keyboard handler and the panels all
 * work from this list — so a sixth mode would be an entry here and an icon.
 */

export type EditorTab = 'create' | 'colour' | 'animate' | 'advanced' | 'code';

export const EDITOR_TABS: readonly EditorTab[] = ['create', 'colour', 'animate', 'advanced', 'code'];

/**
 * The modes this artwork actually offers.
 *
 * Create is the only one that depends on the preset: it shows a handful of
 * curated controls, and an artwork nobody has curated has none to show. An empty
 * Create tab would be worse than no Create tab — it invites a press and answers
 * with nothing — so it is left out, and the artwork opens on Advanced instead,
 * where its real parameters are. Every other mode works from the render options,
 * the palette and the source, which every artwork has.
 */
export function tabsFor(hasCreate: boolean): readonly EditorTab[] {
  return hasCreate ? EDITOR_TABS : EDITOR_TABS.filter((tab) => tab !== 'create');
}

/** Where an artwork opens: its curated controls if it has any, its real ones if not. */
export function defaultTabFor(hasCreate: boolean): EditorTab {
  return hasCreate ? 'create' : 'advanced';
}

/** The label the interface speaks, in British English whatever the file is called. */
export const TAB_NAMES: Record<EditorTab, string> = {
  create: 'Create',
  colour: 'Colour',
  animate: 'Animate',
  advanced: 'Advanced',
  code: 'Code',
};
