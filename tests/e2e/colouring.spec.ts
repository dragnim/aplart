/**
 * Iteration colouring in a real browser.
 *
 * jsdom can prove the reducer and the mapping agree. It cannot prove the canvas
 * changed, and the whole point of a colouring mode is that the picture is
 * different — so this checks the pixels, and checks that no request went out to
 * produce them.
 */

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/** A hash of what is actually on the canvas. */
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

/** The signature once the canvas has stopped changing. */
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

test.describe('iteration colouring', () => {
  test.use({ viewport: WIDE });

  test('repaints the canvas without asking TryAPL again', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const smooth = await settled(page);
    const sent = stub.requests.length;
    expect(sent).toBeGreaterThan(0);

    const mode = page.getByLabel('Mode');
    const signatures = new Set([smooth]);
    for (const choice of ['bands', 'repeating', 'insideOutside', 'threshold']) {
      await mode.selectOption(choice);
      signatures.add(await settled(page));
    }

    // Five readings of the same numbers, five different pictures — and not one
    // of them cost an execution, because the numbers never changed.
    expect(signatures.size).toBe(5);
    expect(stub.requests.length).toBe(sent);
  });

  test('exports the colouring on screen', async ({ page }, testInfo) => {
    await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    await settled(page);

    const save = async (name: string) => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: '512 × 512' }).click();
      const path = testInfo.outputPath(name);
      await (await download).saveAs(path);
      return readFile(path);
    };

    const smooth = await save('smooth.png');
    await page.getByLabel('Mode').selectOption('insideOutside');
    await settled(page);
    const split = await save('inside-outside.png');

    /*
     * The canvas and the export are two renderers reading the same settings,
     * and the second is the one nobody looks at until the file is open. Stage 7
     * shipped an export that quietly ignored the animation phase; this is the
     * same mistake waiting in a different field.
     */
    expect(Buffer.compare(split, smooth)).not.toBe(0);

    const size = (file: Buffer) => [file.readUInt32BE(16), file.readUInt32BE(20)];
    expect(size(split)).toEqual(size(smooth));
  });
});
