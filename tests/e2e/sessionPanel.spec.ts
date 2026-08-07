/**
 * The four editing modes, and the rule that holds them together.
 *
 * "Controls change the artwork. Code must be run." Before this existed, the
 * curated sliders redrew themselves while the technical controls beside them
 * wrote a value and waited for Run — a distinction that made sense only if you
 * knew which panel a control had come from, and none at all once they shared one.
 *
 * So what is checked here is behaviour rather than arrangement: that a committed
 * control in any of the three control modes redraws the artwork, that editing the
 * source does not, and that the modes are four views of one workspace rather than
 * four copies of it.
 */

import { expect, test, type Page } from '@playwright/test';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { stubTryApl, type StubHandle } from './stubTryApl';

const SEED = 20_260_805;

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const artwork = (page: Page) => page.getByRole('img', { name: /grid/ });
const actions = (page: Page) => page.getByRole('group', { name: 'Artwork actions' });
/** Scoped, because a technical name can appear in a Peek explanation too. */
const advancedPanel = (page: Page) => page.locator('#editor-panel-advanced');

/** How many runs have been asked for: one first request per run, then its bands. */
const runs = (requests: readonly string[]) =>
  requests.filter((request) => request.includes(ADAPTIVE_MARKER)).length;

/**
 * A session, drawn once and settled.
 *
 * Waits on the service rather than on "Finished in", because that line belongs to
 * the Run panel and the Run panel belongs to Code — so in any other mode it is
 * hidden, exactly as it was behind the old disclosure. What a session shows while
 * it draws is the note in the Create panel.
 */
async function openSession(page: Page): Promise<StubHandle> {
  const stub = await stubTryApl(page);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto(`./#/art/modular-bloom?play=${String(SEED)}`);
  await expect(artwork(page)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => runs(stub.requests), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Let go of a slider to draw the artwork again.')).toBeVisible();
  return stub;
}

test.describe('the four editing modes', () => {
  test('are icons with names, and Create is where a session opens', async ({ page }) => {
    await openSession(page);

    for (const name of ['Create', 'Colour', 'Animate', 'Advanced', 'Code']) {
      const button = tab(page, name);
      await expect(button).toBeVisible();
      // Named for a screen reader despite being an icon on screen, and titled so
      // the name appears on hover for everybody else.
      await expect(button).toHaveAttribute('title', name);
      // The supplied artwork, inline so it can take the interface's colour.
      await expect(button.locator('svg')).toHaveCount(1);
    }

    await expect(tab(page, 'Create')).toHaveAttribute('aria-selected', 'true');
    // Selection is not carried by colour alone: the selected tab is the only one
    // in the tab order, which is the same fact stated structurally.
    await expect(tab(page, 'Create')).toHaveAttribute('tabindex', '0');
    await expect(tab(page, 'Colour')).toHaveAttribute('tabindex', '-1');
  });

  test('are reachable from the keyboard, arrows and all', async ({ page }) => {
    await openSession(page);

    await tab(page, 'Create').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'Colour')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'Colour')).toBeFocused();

    await page.keyboard.press('End');
    await expect(tab(page, 'Code')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expect(tab(page, 'Create')).toHaveAttribute('aria-selected', 'true');

    // Wrapping, so the set has no dead end.
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 'Code')).toHaveAttribute('aria-selected', 'true');
  });

  test('each show their own controls, over one workspace', async ({ page }) => {
    await openSession(page);

    await expect(page.getByRole('region', { name: 'Make it yours' })).toBeVisible();

    await tab(page, 'Colour').click();
    await expect(page.getByRole('radio', { name: 'Ember', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Invert palette/ })).toBeVisible();

    await tab(page, 'Advanced').click();
    await expect(advancedPanel(page).getByLabel('Modulus')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset parameters' })).toBeVisible();

    await tab(page, 'Code').click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
    // One editor, whatever the mode: a second would be a second undo history.
    await expect(page.locator('.cm-editor')).toHaveCount(1);
  });

  test('gives movement a mode of its own, and takes it out of Colour', async ({ page }) => {
    await openSession(page);

    /*
     * Animation used to sit inside the palette fieldset, because a moving palette
     * is what it moves. Making an artwork move is a creative decision in its own
     * right, though, and burying it under the colour swatches made it a footnote
     * to choosing them.
     */
    await tab(page, 'Colour').click();
    await expect(page.getByRole('button', { name: /Animate palette/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reset animation' })).toHaveCount(0);

    await tab(page, 'Animate').click();
    await expect(page.getByRole('button', { name: /Animate palette/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset animation' })).toBeVisible();
    await expect(page.getByLabel('Movement')).toBeVisible();
    await expect(page.getByLabel(/^Speed/)).toBeVisible();
  });

  test('animates from Animate, with the artwork beside it', async ({ page }) => {
    const stub = await openSession(page);
    await tab(page, 'Animate').click();
    const before = runs(stub.requests);

    await page.getByRole('button', { name: /Animate palette/ }).click();

    // Running: the button offers to stop, which is the one control that must
    // never be behind a mode or a menu.
    await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
    // The artwork is beside it and unchanged as a calculation — movement is done
    // to the picture, not asked of the service.
    await expect(artwork(page)).toBeVisible();
    await page.waitForTimeout(400);
    expect(runs(stub.requests)).toBe(before);

    await page.getByRole('button', { name: /Pause/ }).click();
    await expect(page.getByRole('button', { name: /Animate palette/ })).toBeVisible();
  });
});

test.describe('controls change the artwork', () => {
  test('a Create slider redraws when it is let go', async ({ page }) => {
    const stub = await openSession(page);
    const before = runs(stub.requests);

    const slider = page.getByRole('slider', { name: 'Detail' });
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);

    expect(runs(stub.requests)).toBeGreaterThan(before);
  });

  test('an Advanced control redraws too, with no second press of Run', async ({ page }) => {
    const stub = await openSession(page);
    await tab(page, 'Advanced').click();
    const before = runs(stub.requests);

    const modulus = advancedPanel(page).getByLabel('Modulus');
    await modulus.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);

    expect(runs(stub.requests)).toBeGreaterThan(before);
    // And it is a step back, not the end of the history: Undo names it.
    await expect(actions(page).getByRole('button', { name: /^Undo Modulus/ })).toBeEnabled();
  });

  test('a Colour change applies at once, and asks the service for nothing', async ({ page }) => {
    const stub = await openSession(page);
    await tab(page, 'Colour').click();
    const before = runs(stub.requests);

    const label = await artwork(page).getAttribute('aria-label');
    await page.getByRole('radio', { name: 'Mono', exact: true }).click();

    await expect(artwork(page)).not.toHaveAttribute('aria-label', label ?? '');
    await expect(artwork(page)).toHaveAttribute('aria-label', /Mono/);
    /*
     * A palette is a way of drawing a result, not a different result. Recolouring
     * that re-ran the program would spend a public service's time on arithmetic
     * whose answer is already on screen.
     */
    await page.waitForTimeout(400);
    expect(runs(stub.requests)).toBe(before);

    // Undo answers for what was last changed, which is the colour.
    await actions(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(artwork(page)).toHaveAttribute('aria-label', label ?? '');
  });

  test('but the editor waits for Run', async ({ page }) => {
    const stub = await openSession(page);
    await tab(page, 'Code').click();
    const before = runs(stub.requests);
    const drawn = await artwork(page).getAttribute('aria-label');

    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('modulus←9\nsize←24\nmodulus|∘.×⍨⍳size');
    await page.waitForTimeout(500);

    // Typing is not asking for anything, and the artwork is what it was.
    expect(runs(stub.requests)).toBe(before);
    await expect(artwork(page)).toHaveAttribute('aria-label', drawn ?? '');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect.poll(() => runs(stub.requests), { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(page.getByText(/Finished in/)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('changing mode changes nothing but the mode', () => {
  test('leaves the artwork, the source and the history where they were', async ({ page }) => {
    const stub = await openSession(page);

    // Something to undo, so "the history survived" can be told from "there was
    // no history".
    const slider = page.getByRole('slider', { name: 'Scale' });
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(actions(page).getByRole('button', { name: /^Undo Scale/ })).toBeEnabled();
    await page.waitForTimeout(600);

    const drawn = await artwork(page).getAttribute('aria-label');
    const before = runs(stub.requests);

    for (const mode of ['Colour', 'Animate', 'Advanced', 'Code', 'Create']) {
      await tab(page, mode).click();
      await page.waitForTimeout(150);
    }

    await expect(artwork(page)).toHaveAttribute('aria-label', drawn ?? '');
    expect(runs(stub.requests)).toBe(before);
    await expect(actions(page).getByRole('button', { name: /^Undo Scale/ })).toBeEnabled();
  });

  test('shows the same value in Create and in Advanced', async ({ page }) => {
    await openSession(page);

    /*
     * Two interfaces onto one assignment. Scale is `modulus` under its technical
     * name, so moving one has to move the other — a session that kept two numbers
     * for one line would eventually show a picture that agreed with neither.
     */
    const scale = page.getByRole('slider', { name: 'Scale' });
    await scale.focus();
    await page.keyboard.press('ArrowLeft');
    const chosen = await scale.inputValue();

    await tab(page, 'Advanced').click();
    await expect(advancedPanel(page).getByLabel('Modulus')).toHaveValue(chosen);

    // And back the other way.
    const modulus = advancedPanel(page).getByLabel('Modulus');
    await modulus.focus();
    await page.keyboard.press('ArrowRight');
    const changed = await modulus.inputValue();

    await tab(page, 'Create').click();
    await expect(page.getByRole('slider', { name: 'Scale' })).toHaveValue(changed);
  });

  test('Peek reads, and Edit the APL takes you to the line', async ({ page }) => {
    const stub = await openSession(page);

    await page.getByRole('slider', { name: 'Scale' }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);
    const scale = await page.getByRole('slider', { name: 'Scale' }).inputValue();

    // From here on nothing may change: peeking and revealing are reading.
    const before = runs(stub.requests);
    const drawn = await artwork(page).getAttribute('aria-label');

    const peek = page.locator('details[data-control="modulus"]');
    await peek.getByText('How this changes the APL').click();
    await expect(peek.getByText(/modulus←/)).toBeVisible();

    // Reading changed nothing.
    await expect(actions(page).getByRole('button', { name: /^Undo/ })).toBeEnabled();

    await peek.getByRole('button', { name: /^Edit the APL/ }).click();

    // The Code mode, the line selected, the caret in the editor — and the artwork
    // still beside it, unchanged and un-run.
    await expect(tab(page, 'Code')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toBeFocused();
    // The value itself is selected, ready to be typed over — which is what makes
    // this an invitation to edit rather than a tour of the program.
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(scale);
    await expect(artwork(page)).toHaveAttribute('aria-label', drawn ?? '');
    expect(runs(stub.requests)).toBe(before);
  });
});
