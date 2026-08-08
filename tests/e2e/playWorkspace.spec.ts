/**
 * The Play workspace in a real browser.
 *
 * What only a browser can answer: that the artwork is the dominant thing on the
 * page, that a real drag of a real slider asks the service for one artwork rather
 * than forty, that arrow keys move a range input at all, that a closed disclosure
 * genuinely takes the editor out of the tab order, that Save image writes a file,
 * and that all of it survives a phone-sized screen and Focus mode.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };
const SEED = 20_260_805;

const playPanel = (page: Page) => page.getByRole('region', { name: 'Make it yours' });
/**
 * Randomise, Undo, Save image and Share.
 *
 * Beneath the editing modes rather than inside the curated controls: they act on
 * the artwork, not on one way of changing it, so they stay put as the mode
 * changes. They used to live in the Create panel, which is why so many of these
 * tests once reached for them there.
 */
const sessionActions = (page: Page) => page.getByRole('group', { name: 'Artwork actions' });
const slider = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const artwork = (page: Page) => page.getByRole('img', { name: /grid/ });

/** How many runs have happened: one first request per run, then its bands. */
const runs = (requests: readonly string[]) =>
  requests.filter((request) => request.includes(ADAPTIVE_MARKER)).length;

async function openSession(page: Page, seed: number = SEED) {
  await page.goto(`./#/art/modular-bloom?play=${String(seed)}`);
  await expect(artwork(page)).toBeVisible({ timeout: 30_000 });
}

/** The artwork tab, on a layout that has tabs. */
async function showArtwork(page: Page) {
  const tab = page.getByRole('tab', { name: 'Artwork' });
  if ((await tab.count()) > 0) await tab.click();
}

/** The value a Play control is showing, as a number. */
async function valueOf(page: Page, label: string): Promise<number> {
  return Number(await slider(page, label).inputValue());
}

/**
 * Opens a control's disclosure and returns it.
 *
 * Located by the parameter it explains rather than by its contents: a closed
 * disclosure hides them from the accessibility tree, which is exactly the
 * behaviour being relied on elsewhere, so nothing inside it can be used to find
 * it. Idempotent, because some of these journeys arrive with it already open.
 */
async function openPeek(page: Page, parameterId: string): Promise<Locator> {
  const peek = page.locator(`details[data-control="${parameterId}"]`);
  const open = await peek.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!open) await peek.getByText('How this changes the APL').click();

  return peek;
}

/** Presses one control's "Edit the APL", opening its disclosure if need be. */
async function editApl(page: Page, parameterId: string): Promise<void> {
  const peek = await openPeek(page, parameterId);
  await peek.getByRole('button', { name: /^Edit the APL/ }).click();
}

/** Drags a slider from its thumb towards the right-hand end of its track. */
async function dragRight(page: Page, control: Locator): Promise<void> {
  /*
   * Into view first. The panel's content scrolls within itself now, so a control
   * further down it can be laid out beneath the action bar — and a bounding box
   * is still returned for an element scrolled out of its scroller, so the drag
   * would land on whatever is actually there. A person scrolls to a slider before
   * dragging it; so does this.
   */
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  if (box === null) throw new Error('the slider has no box to drag');

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  // Several moves, so the input reports several values: the point of the test is
  // that many steps become one run.
  for (const fraction of [0.6, 0.7, 0.8, 0.85, 0.9]) {
    await page.mouse.move(box.x + box.width * fraction, y);
  }
  await page.mouse.up();
}

test.describe('the Play workspace', () => {
  test.use({ viewport: WIDE });

  test('puts the artwork first and the three named controls with it', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    const panel = playPanel(page);
    await expect(panel).toBeVisible();
    for (const label of ['Complexity', 'Scale', 'Detail']) {
      await expect(slider(page, label)).toBeVisible();
    }

    /*
     * Dominant, measured rather than asserted: the artwork covers more of the page
     * than the panel that changes it, is the wider of the two, and the controls
     * sit beside it rather than in front of it.
     *
     * Held to outcomes rather than to a ratio. A factor of one and a half was
     * right while the panel was 384px, and became a rule against the layout once
     * the panel took the width the old workspace's control column had — the
     * proportion this composition is deliberately built to echo.
     *
     * Area alone used to be held to a factor of two, which quietly encoded a
     * panel that was capped and scrolling — once it was allowed the height its
     * content needs, a true ratio of 1.9 failed a test that was measuring the
     * defect. Width is the honest expression of which element leads a row.
     */
    const canvas = await page.locator('canvas').first().boundingBox();
    const controls = await panel.boundingBox();
    const area = (box: { width: number; height: number } | null) =>
      box === null ? 0 : box.width * box.height;

    expect(area(canvas)).toBeGreaterThan(area(controls));
    expect(canvas?.width ?? 0).toBeGreaterThan(controls?.width ?? 0);
    expect(controls?.x ?? 0).toBeGreaterThan((canvas?.x ?? 0) + (canvas?.width ?? 0) - 1);

    /*
     * The artwork begins fully visible and may finish below the fold.
     *
     * This once required the whole square above the fold, which is what kept the
     * composition to two-thirds of a wide window: a square sized to clear the
     * fold is a square sized by the shortest side of the screen. A session is
     * allowed to scroll; what it is not allowed to do is open on a picture the
     * visitor has to go looking for.
     */
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    expect(canvas?.y ?? 0).toBeGreaterThanOrEqual(0);
    expect(canvas?.y ?? 0).toBeLessThan(viewport.height * 0.35);
  });

  test('gives every control and action a comfortable target', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    /*
     * The floor the interface itself uses: 44 CSS pixels where a finger is doing
     * the pressing, 32 under a mouse. A slider keeps the larger target either
     * way — it is dragged rather than clicked, and a thin track is hard to catch
     * with any pointer.
     */
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse), (max-width: 60rem)').matches);
    const floor = touch ? 44 : 32;

    for (const label of ['Complexity', 'Scale', 'Detail']) {
      const box = await slider(page, label).boundingBox();
      expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['Randomise', 'Undo', 'Save image', 'Share']) {
      const box = await sessionActions(page).getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(floor);
    }
    // The tabs are icons, so their targets are worth measuring too.
    for (const name of ['Create', 'Colour', 'Animate', 'Advanced', 'Code']) {
      const box = await page.getByRole('tab', { name, exact: true }).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(floor);
      // Square, so an icon-only control is not a sliver to aim at.
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(floor - 8);
    }
  });

  test('a drag rewrites the APL and asks for exactly one artwork', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openSession(page);
    const before = runs(stub.requests);
    const from = await valueOf(page, 'Detail');

    await dragRight(page, slider(page, 'Detail'));

    // The value moved, so the drag was a drag and not a click.
    const to = await valueOf(page, 'Detail');
    expect(to).toBeGreaterThan(from);

    // One run for the whole gesture, and it ran the value it ended on.
    await expect.poll(() => runs(stub.requests)).toBe(before + 1);
    expect(stub.requests.at(-1)).toContain(`size←${String(to)}`);

    await page.waitForTimeout(300);
    expect(runs(stub.requests)).toBe(before + 1);

    // And the real source says so, not only the control.
    await openDisclosure(page);
    await expect(page.locator('.cm-content')).toContainText(`size←${String(to)}`);
  });

  test('arrow keys move a control, and each press is its own step', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openSession(page);
    const from = await valueOf(page, 'Scale');

    await slider(page, 'Scale').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    expect(await valueOf(page, 'Scale')).toBe(from + 2);
    await expect.poll(() => runs(stub.requests)).toBeGreaterThan(1);

    // One press back, not both: two presses are two things somebody did.
    await sessionActions(page).getByRole('button', { name: /^Undo/ }).click();
    expect(await valueOf(page, 'Scale')).toBe(from + 1);
  });

  test('Randomise draws something else, and Undo puts it back without re-running', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openSession(page);

    const opened = { detail: await valueOf(page, 'Detail'), scale: await valueOf(page, 'Scale') };
    const drawnBefore = await artwork(page).getAttribute('aria-label');

    await sessionActions(page).getByRole('button', { name: 'Randomise', exact: true }).click();
    await expect
      .poll(async () => `${String(await valueOf(page, 'Detail'))}:${String(await valueOf(page, 'Scale'))}`)
      .not.toBe(`${String(opened.detail)}:${String(opened.scale)}`);

    await expect.poll(() => runs(stub.requests)).toBe(2);
    const afterRandomise = runs(stub.requests);

    await sessionActions(page).getByRole('button', { name: /^Undo/ }).click();

    // Back to the artwork the session opened with, from the history rather than
    // from the service.
    expect(await valueOf(page, 'Detail')).toBe(opened.detail);
    expect(await valueOf(page, 'Scale')).toBe(opened.scale);
    await expect(artwork(page)).toHaveAttribute('aria-label', drawnBefore ?? '');
    await page.waitForTimeout(300);
    expect(runs(stub.requests)).toBe(afterRandomise);
  });

  test('Save image writes a PNG of what is on screen', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    const download = page.waitForEvent('download');
    await sessionActions(page).getByRole('button', { name: 'Save image' }).click();
    const path = await (await download).path();

    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(path);
    // The PNG signature, so this is an image and not an error page.
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test('Share copies a link that rebuilds the same artwork', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stubTryApl(page);
    await openSession(page);

    const detail = await valueOf(page, 'Detail');
    await sessionActions(page).getByRole('button', { name: 'Share' }).click();

    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#/art/modular-bloom?s=');

    // Opened as a stranger would: the ordinary shared-link workspace, holding the
    // artwork that was made. A share is not a session, so it waits to be run.
    await page.goto(link);
    await expect(page.getByText(/shared with you/)).toBeVisible();
    await expect(playPanel(page)).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText(`size←${String(detail)}`);
  });

  test('keeps the editor out of the way until it is asked for', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    /*
     * A hidden tab panel hides its contents, which is why this is worth asserting
     * in a browser: nothing in it should be tabbable while another mode is on
     * show, and all of it should be there the moment that mode is chosen.
     */
    await expect(page.getByRole('button', { name: /^Run/ })).toBeHidden();
    await expect(page.locator('.cm-content')).toBeHidden();

    await openDisclosure(page);

    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
    await expect(page.locator('.cm-content')).toBeVisible();

    // The technical parameters are their own mode, one press further on.
    await page.getByRole('tab', { name: 'Advanced', exact: true }).first().click();
    await expect(page.locator('#editor-panel-advanced').getByLabel('Modulus', { exact: true })).toBeVisible();
  });

  test('stops offering Undo once the source is edited by hand', async ({ page }) => {
    /*
     * The case only a real editor can prove. A snapshot describes the source
     * before a recorded change, and typing is not recorded — so an Undo offered
     * afterwards would restore a program from before the typing and throw the
     * typing away. Reading the code must cost nothing; changing it must cost the
     * offer.
     */
    await stubTryApl(page);
    await openSession(page);

    const undo = sessionActions(page).getByRole('button', { name: /^Undo/ });
    await dragRight(page, slider(page, 'Detail'));
    await expect(undo).toBeEnabled();

    // Opening the editor and putting the caret in it changes nothing.
    await openDisclosure(page);
    await page.locator('.cm-content').click();
    await expect(undo).toBeEnabled();

    // Typing does.
    await page.keyboard.type(' ⍝ mine');
    await expect(page.locator('.cm-content')).toContainText('⍝ mine');
    await expect(undo).toBeDisabled();

    // And a Play control afterwards starts a fresh sequence, which cannot reach
    // back over the edit. Back to Create for it: a mode that is not on show
    // cannot be typed into, which is the point of there being modes.
    await page.getByRole('tab', { name: 'Create', exact: true }).first().click();
    const edited = await valueOf(page, 'Scale');
    await slider(page, 'Scale').focus();
    await page.keyboard.press('ArrowRight');
    await expect(undo).toBeEnabled();

    await undo.click();
    expect(await valueOf(page, 'Scale')).toBe(edited);
    await expect(page.locator('.cm-content')).toContainText('⍝ mine');
    await expect(undo).toBeDisabled();
  });

  test('explains itself, and takes you to the line it changes', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    const peek = playPanel(page).locator('details[data-control="modulus"]');

    // Closed until asked, and its contents genuinely away rather than merely
    // unstyled — a closed disclosure takes them out of the page.
    await expect(peek).toHaveJSProperty('open', false);
    await expect(peek.getByRole('button', { name: /^Edit the APL/ })).toBeHidden();

    await peek.getByText('How this changes the APL').click();
    await expect(peek).toHaveJSProperty('open', true);

    const scale = await valueOf(page, 'Scale');
    await expect(peek).toContainText('Changes modulus in the APL.');
    await expect(peek).toContainText(`modulus←${String(scale)}`);

    await peek.getByRole('button', { name: 'Edit the APL for Scale' }).click();

    // The editor is showing, the line is on screen, and the value itself is
    // selected — not the whole line, and not merely coloured.
    await expect(page.locator('.cm-content')).toBeVisible();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(String(scale));

    const line = await page.evaluate(() => {
      const node = window.getSelection()?.anchorNode ?? null;
      const element = node instanceof Element ? node : node?.parentElement;
      return element?.closest('.cm-line')?.textContent ?? '';
    });
    expect(line).toBe(`modulus←${String(scale)}`);

    // And the caret is in the editor, so typing goes where the eye was sent.
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('cm-content');
  });

  test('opening the editor is not a page, and costs no history', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./');
    await page.getByRole('link', { name: 'Start creating' }).click();
    await expect(artwork(page)).toBeVisible({ timeout: 30_000 });

    await dragRight(page, slider(page, 'Detail'));
    const undo = sessionActions(page).getByRole('button', { name: /^Undo/ });
    await expect(undo).toBeEnabled();

    const url = page.url();
    const before = runs(stub.requests);
    await editApl(page, 'size');
    await expect(page.locator('.cm-content')).toBeVisible();

    // Nothing ran, the address did not move, and the step back survived.
    expect(runs(stub.requests)).toBe(before);
    expect(page.url()).toBe(url);
    await expect(undo).toBeEnabled();

    // One press of Back leaves the artwork for the gallery, rather than closing
    // an editor somebody never navigated to.
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiny programs.');
  });

  test('lets you type straight away, and says so by dropping Undo', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    await dragRight(page, slider(page, 'Scale'));
    const undo = sessionActions(page).getByRole('button', { name: /^Undo/ });
    await expect(undo).toBeEnabled();

    await editApl(page, 'modulus');
    // The value is selected, so typing replaces it: no clicking, no hunting.
    await page.keyboard.type('9');

    await expect(page.locator('.cm-content')).toContainText('modulus←9');
    await expect(undo).toBeDisabled();
  });

  test('survives Focus mode with its controls over the artwork', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    await page.getByRole('button', { name: 'Focus mode' }).click();

    await expect(playPanel(page)).toBeVisible();
    await expect(slider(page, 'Detail')).toBeVisible();

    // The artwork still has the window: the panel is the drawer over it rather
    // than a column taking a share of it.
    const canvas = await page.locator('canvas').first().boundingBox();
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    expect(canvas?.width ?? 0).toBeGreaterThan(viewport.width * 0.9);

    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(playPanel(page)).toBeVisible();
  });

  test('keeps its controls clear of the Focus-mode drawer', async ({ page }) => {
    /*
     * The drawer opens on the way into Focus mode and sits above the panel, so a
     * centred panel had a third of itself covered — Complexity and Randomise
     * among it. Overlap is measured rather than eyeballed because the two are
     * positioned independently and nothing else would notice them meeting.
     */
    await stubTryApl(page);
    await openSession(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();

    /*
     * The drawer *is* the panel now, rather than something the panel has to keep
     * out of the way of. One set of editing modes serves the ordinary layout and
     * Focus alike, so there is no second control surface to collide with — which
     * is what this test used to have to check.
     */
    const drawer = page.locator('#focus-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-session-panel]')).toHaveCount(1);

    // And every action in it is genuinely pressable where it now sits.
    for (const name of ['Randomise', 'Save image', 'Share']) {
      await expect(sessionActions(page).getByRole('button', { name })).toBeVisible();
    }
    await expect(slider(page, 'Complexity')).toBeVisible();
  });

  test('reveals the line inside Focus mode, in the drawer that is already there', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await editApl(page, 'multiplier');

    // The drawer is where the editor lives in Focus mode, and there is one editor
    // rather than a second one mounted into the overlay.
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await page.locator('.cm-content').count()).toBe(1);

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(String(await valueOf(page, 'Complexity')));
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  });

  test('can be played, explained and left from the keyboard alone', async ({ page, isMobile }) => {
    // iOS Safari does not tab to controls unless the user has turned that on,
    // which is a platform preference rather than something this application sets.
    test.skip(isMobile === true, 'iOS Safari does not tab to controls by default.');

    await stubTryApl(page);
    await openSession(page);

    // Reach the first Play control by tabbing, and move it with the arrow keys.
    const focusedLabel = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        if (active === null) return '';
        const label = active.id === '' ? null : document.querySelector(`label[for="${active.id}"]`);
        return label?.textContent ?? active.textContent ?? '';
      });

    let reached = '';
    for (let press = 0; press < 40 && reached !== 'Complexity'; press += 1) {
      await page.keyboard.press('Tab');
      reached = (await focusedLabel()).trim();
    }
    expect(reached, 'Complexity was not reachable by Tab').toBe('Complexity');

    const from = await valueOf(page, 'Complexity');
    await page.keyboard.press('ArrowRight');
    expect(await valueOf(page, 'Complexity')).toBe(from + 1);

    // The disclosure is the next stop, and opens from the keyboard.
    await page.keyboard.press('Tab');
    expect((await focusedLabel()).trim()).toBe('How this changes the APL');
    await expect(page.locator('details[data-control="multiplier"]')).toHaveJSProperty('open', false);
    await page.keyboard.press('Enter');
    await expect(page.locator('details[data-control="multiplier"]')).toHaveJSProperty('open', true);

    // Then its action, which leaves focus in the editor.
    await page.keyboard.press('Tab');
    expect((await focusedLabel()).trim()).toBe('Edit the APL');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className ?? ''))
      .toContain('cm-content');

    /*
     * And out again. CodeMirror is where a keyboard user could get stuck, so Tab
     * has to leave it rather than indent — this is the check that it does.
     */
    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className ?? ''))
      .not.toContain('cm-content');
  });

  test('leaves an artwork opened from its card exactly as it was', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    await expect(playPanel(page)).toHaveCount(0);
    await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
    // No editing modes either: the full workspace is the workspace.
    await expect(page.getByRole('tab', { name: 'Create' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
    expect(stub.requests).toHaveLength(0);

    // And no Peek: the technical controls are named after the code already, so
    // there is nothing for a disclosure to explain.
    await expect(page.getByText('How this changes the APL')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit the APL/ })).toHaveCount(0);
  });
});

test.describe('the Play workspace on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the controls with the artwork, and the code a tab away', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openSession(page);
    await showArtwork(page);

    // Together, because they are what somebody arrived to use together.
    await expect(artwork(page)).toBeVisible();
    await expect(playPanel(page)).toBeVisible();
    for (const label of ['Complexity', 'Scale', 'Detail']) {
      await expect(slider(page, label)).toBeVisible();
    }

    // Stacked: the picture above the controls, both in one column.
    const canvas = await page.locator('canvas').first().boundingBox();
    const panel = await playPanel(page).boundingBox();
    expect((canvas?.y ?? 0) + (canvas?.height ?? 0)).toBeLessThanOrEqual((panel?.y ?? 0) + 1);
    expect(panel?.width ?? 0).toBeLessThanOrEqual(390);

    // And a control still reaches the real source.
    const from = await valueOf(page, 'Scale');
    await slider(page, 'Scale').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => runs(stub.requests)).toBe(2);
    expect(stub.requests.at(-1)).toContain(`modulus←${String(from + 1)}`);

    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.locator('.cm-content')).toContainText(`modulus←${String(from + 1)}`);
  });

  test('Edit the APL moves to the Code tab and reveals the line there', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);
    await showArtwork(page);

    const detail = await valueOf(page, 'Detail');
    await editApl(page, 'size');

    // The narrow layout keeps the editor in a tab, so the tab is what has to
    // change — and it is the Code tab that ends up selected.
    await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toBeVisible();

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(String(detail));
  });
});

/** Shows the editor, wherever this layout keeps it. */
async function openDisclosure(page: Page): Promise<void> {
  // A session's Code mode on a wide screen, the sheet's Code tab on a narrow
  // one. Both are `role="tab"` and both are named Code, so one press serves.
  await page.getByRole('tab', { name: 'Code' }).first().click();
}
