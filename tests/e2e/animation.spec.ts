/**
 * Palette animation in a real browser.
 *
 * jsdom can be told what a frame is; it cannot run one. What is checked here is
 * the part that only a browser has: real `requestAnimationFrame` timing, a
 * canvas that is actually painted, and an export taken while the artwork is
 * somewhere other than where it started.
 */

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { pressRun, showMode } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/mandelbrot-field');
  await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
  await pressRun(page);
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
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

/**
 * The signature once the canvas has stopped changing.
 *
 * A baseline taken the instant a run finishes can catch the canvas before it
 * has painted at all — a 402-byte blank data URL, which then differs from
 * everything afterwards and makes "nothing moved" fail against an artwork that
 * had simply not appeared yet.
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

async function exportTo(page: Page, path: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: '512 × 512' }).click();
  await (await download).saveAs(path);
  return readFile(path);
}

test.describe('palette animation', () => {
  test.use({ viewport: WIDE });

  test('repaints the canvas over real frames, and stops when paused', async ({ page }) => {
    await openAndRun(page);
    const still = await settled(page);

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();

    // Real frames, real clock. Polling rather than a fixed wait, so a slow
    // machine is not the reason this passes or fails.
    await expect.poll(() => canvasSignature(page), { timeout: 10_000 }).not.toBe(still);

    await page.getByRole('button', { name: 'Pause' }).click();
    const frozen = await canvasSignature(page);
    await page.waitForTimeout(600);

    // Byte-identical after two thirds of a second: the loop really has stopped
    // rather than continuing to paint the same thing.
    expect(await canvasSignature(page)).toBe(frozen);
  });

  test('exports the frame on screen, not the palette as saved', async ({ page }, testInfo) => {
    await openAndRun(page);
    // Settled before anything moves. Afterwards there is nothing to settle to.
    const still = await settled(page);
    const atRest = await exportTo(page, testInfo.outputPath('at-rest.png'));

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
    await expect.poll(() => canvasSignature(page), { timeout: 10_000 }).not.toBe(still);

    // Paused on a frame somebody liked, which is when Export is most likely to
    // be pressed — and the case an earlier version got wrong by rewinding to
    // the saved palette.
    await page.getByRole('button', { name: 'Pause' }).click();
    const moved = await exportTo(page, testInfo.outputPath('moved.png'));

    expect(moved.length).toBeGreaterThan(0);
    expect(Buffer.compare(moved, atRest)).not.toBe(0);

    // Same picture, different colours: the matrix has not moved.
    const size = (file: Buffer) => [file.readUInt32BE(16), file.readUInt32BE(20)];
    expect(size(moved)).toEqual(size(atRest));
  });

  test('returns to the saved palette on reset', async ({ page }, testInfo) => {
    await openAndRun(page);
    const still = await settled(page);
    const atRest = await exportTo(page, testInfo.outputPath('before.png'));

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
    await expect.poll(() => canvasSignature(page), { timeout: 10_000 }).not.toBe(still);

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Reset animation' }).click();
    await expect(
      (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }),
    ).toBeVisible();

    // Identical bytes, not merely a similar picture.
    const after = await exportTo(page, testInfo.outputPath('after.png'));
    expect(Buffer.compare(after, atRest)).toBe(0);
  });

  test('never starts on its own', async ({ page }) => {
    await openAndRun(page);
    const still = await settled(page);
    await page.waitForTimeout(800);

    // Nothing moves until it is asked to, whatever the motion preference.
    expect(await canvasSignature(page)).toBe(still);
    await expect(
      (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }),
    ).toBeVisible();
  });
});
