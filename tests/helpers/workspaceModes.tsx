/**
 * Reaching a workspace mode, the way a person reaches it.
 *
 * Every artwork is now edited through one panel of tabbed modes, so the editor,
 * the parameter sliders, the palette and the movement controls are each behind
 * the tab they belong to. A test that wants one of them has to go there first —
 * exactly as somebody using the application does.
 *
 * This exists so that "select a mode" is written once. The alternative was a
 * different ad-hoc query in each of two dozen files, which is how a suite ends up
 * asserting against the implementation instead of the interface. Nothing here
 * reveals hidden content or reaches around the tab: it presses the tab, and the
 * panel that appears is the panel a visitor would be looking at.
 */

import { fireEvent, screen, within, type BoundFunctions, type queries } from '@testing-library/react';
import { type UserEvent } from '@testing-library/user-event';

export const MODES = ['Create', 'Colour', 'Animate', 'Advanced', 'Code'] as const;

export type Mode = (typeof MODES)[number];

/** The tab bar of editing modes, as distinct from the narrow layout's own tabs. */
function modeTab(mode: Mode): HTMLElement {
  return screen.getByRole('tab', { name: mode });
}

/**
 * Press a mode's tab and return its panel.
 *
 * A plain click, which is what the tab listens for, and which works under fake
 * timers — several of these tests install one. A test that would rather drive a
 * full pointer sequence has `showModeWith` below.
 */
export function showMode(mode: Mode): HTMLElement {
  fireEvent.click(modeTab(mode));
  return modePanel(mode);
}

/** As `showMode`, for a test that would rather await a real pointer sequence. */
export async function showModeWith(user: UserEvent, mode: Mode): Promise<HTMLElement> {
  await user.click(modeTab(mode));
  return modePanel(mode);
}

/**
 * The panel for a mode, whether or not it is the one showing.
 *
 * Queried by its tabpanel role and its tab's name, so a test scoping into it
 * gets the same element the tab controls. Hidden panels are still in the tree —
 * that is what keeps the editor's undo history alive — so `hidden: true` is
 * needed to find one that is not selected, and callers that care about
 * visibility should assert it rather than rely on the query.
 */
export function modePanel(mode: Mode): HTMLElement {
  return screen.getByRole('tabpanel', { name: mode, hidden: true });
}

/** Which mode is showing, by name. */
export function selectedMode(): string | null {
  return screen.getByRole('tab', { selected: true }).getAttribute('aria-label');
}

/** Every mode this artwork offers, in the order the tab bar shows them. */
export function offeredModes(): string[] {
  return screen
    .getAllByRole('tab')
    .map((tab) => tab.getAttribute('aria-label'))
    .filter((name): name is string => name !== null);
}

/**
 * Press Run, from wherever the test happens to be.
 *
 * Run is a Code idea and lives in the Code mode, so this goes there first —
 * which is what somebody who wants to run their program does. Returning to the
 * previous mode afterwards would be tidier and less true: a person who presses
 * Run is looking at their code, and the tests that go on to assert about the
 * palette now say so by asking for the palette.
 */
export function pressRun(): void {
  fireEvent.click(within(showMode('Code')).getByRole('button', { name: /^Run/ }));
}

/** As `pressRun`, driving the caller's own pointer. */
export async function pressRunWith(user: UserEvent): Promise<void> {
  const code = await showModeWith(user, 'Code');
  await user.click(within(code).getByRole('button', { name: /^Run/ }));
}

/**
 * A named palette, in the mode that owns the palette.
 *
 * Colour is where an artwork's colours are chosen; the swatches used to sit in
 * the one long column with everything else.
 */
export function paletteChoice(name: string | RegExp): HTMLElement {
  return within(showMode('Colour')).getByRole('radio', { name });
}

/**
 * A control from Advanced: the raw parameters, orientation, display, tiling and
 * the cell reader. Everything, in other words, that is about the exact numbers
 * rather than about the artwork's character.
 */
export function advanced(): BoundFunctions<typeof queries> {
  return within(showMode('Advanced'));
}

/** The Colour mode's panel, scoped. */
export function colour(): BoundFunctions<typeof queries> {
  return within(showMode('Colour'));
}

/** The Code mode's panel, scoped: the editor, the symbols, Run and Copy APL. */
export function code(): BoundFunctions<typeof queries> {
  return within(showMode('Code'));
}

/** The APL editor, in the mode that holds it. */
export function codeEditor(): HTMLElement {
  return within(showMode('Code')).getByRole('textbox', { name: /APL/i });
}

/** The movement controls, which are a mode of their own. */
export function animate(): BoundFunctions<typeof queries> {
  return within(showMode('Animate'));
}

/** Randomise, Undo and Reset, which sit beneath every mode. */
export function artworkActions(): HTMLElement {
  return screen.getByRole('group', { name: 'Artwork actions' });
}

/** A named action from the persistent row. */
export function artworkAction(name: string | RegExp): HTMLElement {
  return within(artworkActions()).getByRole('button', { name });
}
