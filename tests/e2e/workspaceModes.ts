/**
 * Reaching a workspace mode in a real browser, the way a person reaches it.
 *
 * The counterpart of `tests/helpers/workspaceModes.tsx`, and it exists for the
 * same reason: every artwork is edited through one panel of tabbed modes, so the
 * editor, Run, the parameter sliders and the palette are each behind the tab
 * they belong to. A test that wants one of them presses that tab first.
 *
 * Unlike the jsdom helper, this one has real CSS: a panel behind another tab is
 * genuinely not on screen, so nothing here can accidentally succeed against
 * something a visitor could not see.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export type Mode = 'Create' | 'Colour' | 'Animate' | 'Advanced' | 'Code';

/**
 * Press a mode's tab. Idempotent: pressing the tab you are on changes nothing.
 *
 * On a narrow screen and in Focus mode the modes live inside a drawer, so the
 * tab is not on screen until the drawer is — and that is the same door a person
 * goes through. Opened only when the tab is genuinely not there, so a test that
 * has already opened it is not toggled shut.
 */
export async function showMode(page: Page, mode: Mode): Promise<Locator> {
  const tab = page.getByRole('tab', { name: mode, exact: true });

  if (!(await tab.isVisible())) {
    const controls = page.getByRole('button', { name: 'Controls', exact: true });
    if ((await controls.count()) > 0 && (await controls.first().isVisible())) {
      await controls.first().click();
    }
  }

  /*
   * A narrow screen has no modes to select.
   *
   * The stacked layout keeps the three tabs it always had — Artwork, Code,
   * Controls — and shows Colour, Animate and Advanced together beneath the last
   * of them, because on a phone a panel of icons to choose between panels is one
   * layer too many. So there is no Colour tab to press: the equivalent act is
   * pressing Controls, and everything this helper's callers look for is in there.
   */
  if ((await tab.count()) === 0) {
    const layoutTab = page.getByRole('tab', { name: mode === 'Code' ? 'Code' : 'Controls', exact: true });
    await layoutTab.click();
    await expect(layoutTab).toHaveAttribute('aria-selected', 'true');
    return page.getByRole('tabpanel');
  }

  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return modePanel(page, mode);
}

/** A mode's panel, scoped so a query cannot stray into a neighbouring one. */
export function modePanel(page: Page, mode: Mode): Locator {
  return page.getByRole('tabpanel', { name: mode });
}

/**
 * Press Run, from wherever the test happens to be.
 *
 * Run means "run this source", which is a Code idea, so it lives with the code.
 * Going there is part of the act rather than a detour around the interface.
 */
export async function pressRun(page: Page): Promise<void> {
  const code = await showMode(page, 'Code');
  await code.getByRole('button', { name: /^Run/ }).click();
}

/** The Run button itself, for the tests that assert about it rather than press it. */
export async function runButton(page: Page): Promise<Locator> {
  const code = await showMode(page, 'Code');
  return code.getByRole('button', { name: /^Run/ });
}

/** The APL editor, in the mode that holds it. */
export async function editorOn(page: Page): Promise<Locator> {
  await showMode(page, 'Code');
  return page.locator('.cm-content');
}

/*
 * The same two, as plain locators.
 *
 * For the tests that measure rather than press — a control's colour, its height,
 * its focus ring — and that therefore need the panel already showing before they
 * look. They say `await showMode(page, 'Code')` themselves, once, and then hold
 * an ordinary locator instead of a promise.
 */
export function runLocator(page: Page): Locator {
  return modePanel(page, 'Code').getByRole('button', { name: /^Run/ });
}

export function editorLocator(page: Page): Locator {
  return page.locator('.cm-content');
}

/**
 * The palettes, by name.
 *
 * Named here so the helper below can tell a colour choice from a shape choice
 * without the caller having to say which mode it meant. The list is the one the
 * Colour mode offers; anything else asking to be chosen is Advanced's.
 */
const PALETTE_NAMES = new Set([
  'Ember',
  'Mono',
  'Poolrooms',
  'Neon',
  'Sunset',
  'Forest',
  'Blueprint',
  'Heat',
  'Abyss',
  'Custom',
]);

/**
 * A radio-style choice, in whichever mode owns it.
 *
 * Several specs had a local helper of this shape already, for a reason worth
 * keeping: "Repeat" is inside "Mirror repeat" and "50%" inside "150%", so the
 * exactness must not be forgotten. What it now also carries is where to look —
 * palettes are chosen in Colour, and orientation, display and tiling in
 * Advanced.
 */
export async function choice(page: Page, name: string): Promise<Locator> {
  const panel = PALETTE_NAMES.has(name) ? await showMode(page, 'Colour') : await advanced(page);
  return panel.getByRole('radio', { name, exact: true });
}

/** Randomise, Undo and Reset, which sit beneath every mode. */
export function artworkActions(page: Page): Locator {
  return page.getByRole('group', { name: 'Artwork actions' });
}

/** A named palette, in the mode that owns the palette. */
export async function paletteChoice(page: Page, name: RegExp | string): Promise<Locator> {
  const colour = await showMode(page, 'Colour');
  return colour.getByRole('radio', { name });
}

/** The Advanced panel: the raw parameters, orientation, display, tiling, cell reader. */
export async function advanced(page: Page): Promise<Locator> {
  return showMode(page, 'Advanced');
}

/**
 * Into Focus mode, from wherever this width has put the control.
 *
 * The app bar cannot hold a wordmark, a title, Focus and a menu on one row on a
 * phone, so below 36rem Focus folds into the Actions overflow beside them. It is
 * the same action either way, and a test about Focus should not have to know
 * which width it is running at.
 */
export async function enterFocus(page: Page): Promise<void> {
  const direct = page.getByRole('button', { name: 'Focus mode' });
  if ((await direct.count()) > 0) {
    await direct.first().click();
    return;
  }

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Focus mode' }).click();
}
