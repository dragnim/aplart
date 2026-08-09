/**
 * Focus mode in a real browser.
 *
 * The integration tests cover what Focus mode does to the workspace's state.
 * These cover what only a browser can answer: whether the artwork actually
 * grows, whether opening the drawer disturbs it, and whether what would be
 * exported is decided by the matrix rather than by the size of the window.
 */

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { enterFocus, editorOn, pressRun } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function open(page: Page, presetId: string, title: string) {
  await page.goto(`./#/art/${presetId}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function runAndWait(page: Page) {
  await pressRun(page);
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 20_000 });
}

/** See studio.spec.ts: hashes the whole image, not a prefix of it. */
async function canvasSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 'no-canvas';
    const data = canvas.toDataURL();
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) {
      hash ^= data.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${data.length}:${hash.toString(16)}`;
  });
}

/**
 * The signature, once the canvas has stopped changing.
 *
 * Three identical consecutive reads rather than two. Entering Focus mode
 * resizes the canvas, and the repaint that follows is driven by a
 * ResizeObserver; with the whole suite running in parallel, a single quiet
 * interval was not enough to be sure the resize had already happened, and a
 * baseline captured mid-settle then failed a later comparison for the wrong
 * reason.
 */
async function settled(page: Page): Promise<string> {
  let previous = await canvasSignature(page);
  let repeats = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await canvasSignature(page);
    repeats = current === previous ? repeats + 1 : 0;
    previous = current;
    if (repeats >= 2) return current;
  }
  return previous;
}

/** Waits for the artwork to have taken over the window. */
async function fillsTheWindow(page: Page, viewport: { height: number }) {
  await expect
    .poll(async () => (await page.locator('canvas').boundingBox())?.height ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(viewport.height * 0.9);
}

/**
 * How many distinct colours are on the canvas.
 *
 * A canvas that was resized but never repainted is one flat colour, which no
 * signature comparison would catch on its own — the point of a resize test is
 * that something is still drawn afterwards.
 */
async function colourCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 0;
    const context = canvas.getContext('2d');
    if (context === null) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set<number>();
    // Every 64th pixel is plenty to tell a picture from a blank rectangle.
    for (let offset = 0; offset < data.length; offset += 4 * 64) {
      seen.add(((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0));
    }
    return seen.size;
  });
}

/** Width and height straight out of a PNG's IHDR chunk. */
async function pngSize(path: string) {
  const bytes = await readFile(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function exportOriginal(page: Page, path: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'Original size' }).click();
  await (await download).saveAs(path);
  return pngSize(path);
}

test.describe('Focus mode', () => {
  test.use({ viewport: WIDE });

  test('gives the artwork the whole window', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await runAndWait(page);

    const before = await page.locator('canvas').boundingBox();
    await enterFocus(page);
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();

    // The whole point of the mode: nearly the full height of the window.
    await fillsTheWindow(page, WIDE);

    const after = await page.locator('canvas').boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect((after as { height: number }).height).toBeGreaterThan((before as { height: number }).height);
  });

  test('opening and closing the drawer never disturbs the artwork', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await runAndWait(page);

    await enterFocus(page);
    // Entering does resize the canvas. That has to be over before the baseline
    // is taken, or this measures the entry rather than the drawer.
    await fillsTheWindow(page, WIDE);
    const withDrawer = await settled(page);

    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.waitForTimeout(500);
    const withoutDrawer = await settled(page);

    /*
     * The drawer overlays the artwork and slides with a transform rather than
     * taking width from it, so the canvas is never asked to resize and the
     * picture is never repainted. A byte-identical canvas is the evidence.
     */
    expect(withoutDrawer).toBe(withDrawer);
  });

  test('what would be exported does not depend on the size of the window', async ({ page }, testInfo) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await runAndWait(page);

    const inWorkspace = await exportOriginal(page, testInfo.outputPath('workspace.png'));

    await enterFocus(page);
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.waitForTimeout(500);

    const inFocus = await exportOriginal(page, testInfo.outputPath('focus.png'));

    // The export is rendered from the matrix, not captured from the screen.
    expect(inFocus).toEqual(inWorkspace);
  });

  test('a Truchet tiling is redrawn after a resize, at unchanged export size', async ({ page }, testInfo) => {
    await stubTryApl(page);
    await open(page, 'truchet-grid', 'Truchet Grid');
    await runAndWait(page);
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();

    const inWorkspace = await exportOriginal(page, testInfo.outputPath('tiles-workspace.png'));

    await enterFocus(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await settled(page);

    // Motifs are rasterised at a cell size taken from the matrix and then
    // scaled to fit, so a resize must repaint rather than stretch or blank.
    expect(await colourCount(page)).toBeGreaterThan(2);

    const inFocus = await exportOriginal(page, testInfo.outputPath('tiles-focus.png'));
    expect(inFocus).toEqual(inWorkspace);
  });

  test('Escape closes the drawer before it leaves Focus mode', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');

    await enterFocus(page);
    const drawer = page.locator('#focus-drawer');
    await expect(drawer).toHaveAttribute('data-drawer', 'open');

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveAttribute('data-drawer', 'closed');
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Focus mode' })).toBeVisible();
  });

  test('announces the run status from one place at a time', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await enterFocus(page);

    const overlayStatus = page.locator('[role="status"][data-state]');
    const runPanelStatus = page.locator('[role="status"][data-status]');

    // Drawer open: the Run panel speaks, the overlay bar only shows.
    await expect(overlayStatus).toHaveAttribute('aria-live', 'off');
    await expect(runPanelStatus).toHaveAttribute('aria-live', 'polite');

    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    // Drawer closed and inert: the overlay bar takes over.
    await expect(overlayStatus).toHaveAttribute('aria-live', 'polite');
  });

  test('the code is the same document in both modes', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');

    await (await editorOn(page)).fill('size←12\nmodulus←5\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size');
    await enterFocus(page);

    // Same editor, so the edit is still there and undo still knows about it.
    await expect(await editorOn(page)).toContainText('modulus←5');
    await runAndWait(page);
    await expect(page.getByRole('img', { name: /12 by 12 grid/ })).toBeVisible();

    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(await editorOn(page)).toContainText('modulus←5');
    await expect(page.getByRole('img', { name: /12 by 12 grid/ })).toBeVisible();
  });
});

test.describe('Focus mode on a phone', () => {
  test.use({ viewport: PHONE });

  test('offers the controls as a sheet that can be dismissed to see the artwork', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await page.getByRole('tab', { name: 'Code' }).click();
    await runAndWait(page);

    await enterFocus(page);
    const sheet = page.locator('#focus-drawer');
    await expect(sheet).toHaveAttribute('data-drawer', 'open');

    // `exact` matters: the symbol palette holds Enclose and Disclose.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toHaveAttribute('data-drawer', 'closed');

    const handle = page.locator('button[aria-controls="focus-drawer"]');
    await expect(handle).toBeVisible();
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();

    await handle.click();
    await expect(sheet).toHaveAttribute('data-drawer', 'open');
    // Covered by the sheet, so no longer a tab stop behind it.
    await expect(handle).toBeHidden();
  });

  test('drops the artwork tab, because the artwork is the backdrop', async ({ page }) => {
    await stubTryApl(page);
    await open(page, 'modular-bloom', 'Modular Bloom');
    await expect(page.getByRole('tab', { name: 'Artwork' })).toBeVisible();

    await enterFocus(page);
    await expect(page.getByRole('tab', { name: 'Artwork' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.getByRole('tab', { name: 'Artwork' })).toBeVisible();
  });
});
