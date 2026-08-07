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

/** The label the interface speaks, in British English whatever the file is called. */
export const TAB_NAMES: Record<EditorTab, string> = {
  create: 'Create',
  colour: 'Colour',
  animate: 'Animate',
  advanced: 'Advanced',
  code: 'Code',
};
