/**
 * Exporting a repeated composition.
 *
 * Only a browser can answer these. The export builds a real canvas and encodes
 * a real PNG, and the questions — are the dimensions exactly what was asked
 * for, is there a seam between copies, did an overlay get in — are all about
 * the bytes that come out.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { choice, pressRun, showMode } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openAndRun(page: Page, preset = 'truchet-grid') {
  await stubTryApl(page);
  await page.goto(`./#/art/${preset}`);
  await pressRun(page);
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

/** The PNG's own header, which is the only dimension worth trusting. */
function pngSize(file: Buffer): { width: number; height: number } {
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

async function exportAt(page: Page, label: string): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const saved = await download;
  const path = await saved.path();
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

async function chooseRepeat(page: Page, mode: string, count: string, scale = '100%') {
  await (await choice(page, mode)).click();
  await (await choice(page, count)).click();
  await (await choice(page, scale)).click();
}

async function turnOnRepeatExport(page: Page) {
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
  // The menu stays open on a toggle; close it so the next open is clean.
  await page.keyboard.press('Escape');
}

/**
 * Counts rows or columns that are entirely one colour.
 *
 * A gap between copies shows up as a full line of background. The artwork has
 * plenty of background pixels; an unbroken line of them across the whole image
 * is the signature of a seam rather than of the picture.
 */
async function emptyLines(page: Page, png: Buffer): Promise<number> {
  const base64 = png.toString('base64');
  return page.evaluate(async (encoded) => {
    /*
     * Decoded from the bytes rather than fetched from a data URL: the page
     * serves itself under a content policy that does not allow connecting to
     * one, and the image only needs to reach a canvas.
     */
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) return -1;
    context.drawImage(bitmap, 0, 0);

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let empty = 0;
    const inset = Math.floor(canvas.width * 0.02);
    for (let x = inset; x < canvas.width - inset; x += 1) {
      let dark = true;
      for (let y = inset; y < canvas.height - inset && dark; y += 2) {
        const at = (y * canvas.width + x) * 4;
        if ((data[at] as number) > 90) dark = false;
      }
      if (dark) empty += 1;
    }
    return empty;
  }, base64);
}

test.describe('exporting a repeat', () => {
  test.use({ viewport: WIDE });

  test('writes one tile unless asked otherwise, unchanged', async ({ page }) => {
    await openAndRun(page);
    const before = await exportAt(page, '512 × 512');

    await chooseRepeat(page, 'Repeat', '3 by 3');
    const stillOneTile = await exportAt(page, '512 × 512');

    // Choosing a repeat on screen does not silently change what Export writes.
    expect(Buffer.compare(stillOneTile, before)).toBe(0);
    expect(pngSize(before)).toEqual({ width: 512, height: 512 });
  });

  test('writes the composition once asked, at the exact size', async ({ page }) => {
    await openAndRun(page);
    const oneTile = await exportAt(page, '512 × 512');

    await chooseRepeat(page, 'Repeat', '3 by 3');
    await turnOnRepeatExport(page);
    const repeated = await exportAt(page, '512 × 512');

    expect(pngSize(repeated)).toEqual({ width: 512, height: 512 });
    expect(Buffer.compare(repeated, oneTile)).not.toBe(0);
  });

  test('has no seam at any count, scale or mode', async ({ page }) => {
    /*
     * Eighteen combinations, each encoding a 512-pixel PNG and decoding it again
     * to count empty lines. That is genuinely a minute's work and it had been
     * finishing within a hair of the default timeout — 28.8s, then 29.8s, then
     * 30.2s as the suite grew — so it began timing out under parallel load
     * rather than failing. Given the time it needs, it passes.
     */
    test.slow();

    await openAndRun(page);
    await chooseRepeat(page, 'Repeat', '3 by 3');
    await turnOnRepeatExport(page);

    const single = await emptyLines(page, await exportAt(page, '512 × 512'));

    for (const mode of ['Repeat', 'Mirror repeat']) {
      for (const count of ['2 by 2', '3 by 3', '5 by 5']) {
        for (const scale of ['50%', '100%', '200%']) {
          await chooseRepeat(page, mode, count, scale);
          const png = await exportAt(page, '512 × 512');
          expect(pngSize(png)).toEqual({ width: 512, height: 512 });
          expect(await emptyLines(page, png), `${mode} ${count} ${scale}`).toBeLessThanOrEqual(single);
        }
      }
    }
  });

  test('keeps the artwork’s own rotation, applied before the composition', async ({ page }) => {
    await openAndRun(page);
    await chooseRepeat(page, 'Mirror repeat', '2 by 2');
    await turnOnRepeatExport(page);
    const upright = await exportAt(page, '512 × 512');

    await (await choice(page, '90°')).click();
    const turned = await exportAt(page, '512 × 512');

    // The base tile is rotated and then repeated, so the result differs.
    expect(Buffer.compare(turned, upright)).not.toBe(0);
    expect(pngSize(turned)).toEqual({ width: 512, height: 512 });
  });

  test('excludes the seam guides and the selection marker', async ({ page }) => {
    await openAndRun(page);
    await chooseRepeat(page, 'Repeat', '3 by 3');
    await turnOnRepeatExport(page);
    const plain = await exportAt(page, '512 × 512');

    // Both are overlays on the screen and neither belongs in a saved image.
    await page.getByLabel(/Show seam guides/).check();
    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 200, y: 200 } });
    const withOverlays = await exportAt(page, '512 × 512');

    expect(Buffer.compare(withOverlays, plain)).toBe(0);
  });

  test('captures one animation phase across every copy', async ({ page }) => {
    await openAndRun(page);
    await chooseRepeat(page, 'Repeat', '2 by 2');
    await turnOnRepeatExport(page);
    const atRest = await exportAt(page, '512 × 512');

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Pause' }).click();
    const moved = await exportAt(page, '512 × 512');

    expect(Buffer.compare(moved, atRest)).not.toBe(0);

    /*
     * One phase throughout: the four copies come from one prepared tile, so if
     * the phase were read per copy the quadrants would disagree. Compared as
     * quadrants of the finished image.
     */
    const quadrantsAgree = await page.evaluate(async (encoded) => {
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) return false;
      context.drawImage(bitmap, 0, 0);

      const half = Math.floor(canvas.width / 2);
      const a = context.getImageData(0, 0, half, half).data;
      const b = context.getImageData(half, 0, half, half).data;
      for (let index = 0; index < a.length; index += 1) {
        if (Math.abs((a[index] as number) - (b[index] as number)) > 2) return false;
      }
      return true;
    }, moved.toString('base64'));

    expect(quadrantsAgree).toBe(true);
  });

  test('makes no request to run anything', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/truchet-grid');
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const sent = stub.requests.length;
    await chooseRepeat(page, 'Mirror repeat', '5 by 5', '50%');
    await turnOnRepeatExport(page);
    await exportAt(page, '1024 × 1024');

    expect(stub.requests.length).toBe(sent);
  });

  test('is not offered while nothing is repeated', async ({ page }) => {
    await openAndRun(page);
    await page.getByRole('button', { name: 'Export' }).click();

    // One copy and a composition are the same picture; two controls for it
    // would read as a fault rather than a choice.
    await expect(page.getByRole('menuitemcheckbox', { name: /Export current tiling/ })).toBeHidden();
  });
});
