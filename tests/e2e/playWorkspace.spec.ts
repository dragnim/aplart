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

/** Drags a slider from its thumb towards the right-hand end of its track. */
async function dragRight(page: Page, control: Locator): Promise<void> {
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
     * Dominant, measured rather than asserted: the artwork covers several times
     * the page the panel that changes it does, the controls are beside it rather
     * than in front of it, and both are whole in the window — a session that
     * opened with its picture cut off by the fold would not be putting the artwork
     * first whatever the proportions said.
     */
    const canvas = await page.locator('canvas').first().boundingBox();
    const controls = await panel.boundingBox();
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const area = (box: { width: number; height: number } | null) =>
      box === null ? 0 : box.width * box.height;

    expect(area(canvas)).toBeGreaterThan(area(controls) * 2);
    expect(controls?.x ?? 0).toBeGreaterThan((canvas?.x ?? 0) + (canvas?.width ?? 0) - 1);
    expect((canvas?.y ?? 0) + (canvas?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    expect((controls?.y ?? 0) + (controls?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
  });

  test('gives every control and action a comfortable target', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    // 44 CSS pixels, the size this project uses everywhere else.
    for (const label of ['Complexity', 'Scale', 'Detail']) {
      const box = await slider(page, label).boundingBox();
      expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['Randomise', 'Undo', 'Save image', 'Share']) {
      const box = await playPanel(page).getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
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
    await playPanel(page).getByRole('button', { name: /^Undo/ }).click();
    expect(await valueOf(page, 'Scale')).toBe(from + 1);
  });

  test('Randomise draws something else, and Undo puts it back without re-running', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openSession(page);

    const opened = { detail: await valueOf(page, 'Detail'), scale: await valueOf(page, 'Scale') };
    const drawnBefore = await artwork(page).getAttribute('aria-label');

    await playPanel(page).getByRole('button', { name: 'Randomise' }).click();
    await expect
      .poll(async () => `${String(await valueOf(page, 'Detail'))}:${String(await valueOf(page, 'Scale'))}`)
      .not.toBe(`${String(opened.detail)}:${String(opened.scale)}`);

    await expect.poll(() => runs(stub.requests)).toBe(2);
    const afterRandomise = runs(stub.requests);

    await playPanel(page).getByRole('button', { name: /^Undo/ }).click();

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
    await playPanel(page).getByRole('button', { name: 'Save image' }).click();
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
    await playPanel(page).getByRole('button', { name: 'Share' }).click();

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
     * A closed disclosure hides its contents, which is why this is worth asserting
     * in a browser: nothing in it should be tabbable while it is shut, and all of
     * it should be there when it is not.
     */
    await expect(page.getByRole('button', { name: /^Run/ })).toBeHidden();
    await expect(page.locator('.cm-content')).toBeHidden();

    await openDisclosure(page);

    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByLabel('Modulus', { exact: true })).toBeVisible();
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

    const undo = playPanel(page).getByRole('button', { name: /^Undo/ });
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
    // back over the edit.
    const edited = await valueOf(page, 'Scale');
    await slider(page, 'Scale').focus();
    await page.keyboard.press('ArrowRight');
    await expect(undo).toBeEnabled();

    await undo.click();
    expect(await valueOf(page, 'Scale')).toBe(edited);
    await expect(page.locator('.cm-content')).toContainText('⍝ mine');
    await expect(undo).toBeDisabled();
  });

  test('survives Focus mode with its controls over the artwork', async ({ page }) => {
    await stubTryApl(page);
    await openSession(page);

    await page.getByRole('button', { name: 'Focus mode' }).click();

    await expect(playPanel(page)).toBeVisible();
    await expect(slider(page, 'Detail')).toBeVisible();

    // The artwork still has the window: the panel floats over it rather than
    // taking a share of it.
    const canvas = await page.locator('canvas').first().boundingBox();
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    expect(canvas?.width ?? 0).toBeGreaterThan(viewport.width * 0.9);

    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(playPanel(page)).toBeVisible();
  });

  test('leaves an artwork opened from its card exactly as it was', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    await expect(playPanel(page)).toHaveCount(0);
    await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
    // No disclosure either: the full workspace is the workspace.
    await expect(page.getByText('Code and full controls')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
    expect(stub.requests).toHaveLength(0);
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
});

/** Opens the full workspace, wherever this layout keeps it. */
async function openDisclosure(page: Page): Promise<void> {
  const summary = page.getByText('Code and full controls');
  if ((await summary.count()) > 0) {
    await summary.click();
    return;
  }
  // The narrow layout keeps the code in a tab instead of a disclosure.
  await page.getByRole('tab', { name: 'Code' }).click();
}
