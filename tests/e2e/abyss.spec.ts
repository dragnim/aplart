/**
 * Abyss where only a browser can check it.
 *
 * The palette's colours are arithmetic and tested as such. What needs a real
 * canvas is that it survives the presentation features intact: Focus mode,
 * repeated composition, and both kinds of export. The specific risk in a ramp
 * that ends at black is an exported image that is black where it should not be,
 * or a repeated copy that disagrees with its neighbours.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { choice, pressRun, showMode } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/mandelbrot-field');
  await pressRun(page);
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

/** What the drawn canvas contains, as counted colours. */
async function inspectCanvas(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return null;
    const context = canvas.getContext('2d');
    if (context === null) return null;

    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let black = 0;
    let blue = 0;
    let other = 0;
    const seen = new Set<string>();
    for (let at = 0; at < data.length; at += 4) {
      const r = data[at] as number;
      const g = data[at + 1] as number;
      const b = data[at + 2] as number;
      seen.add(`${String(r)},${String(g)},${String(b)}`);
      if (r < 12 && g < 12 && b < 24) black += 1;
      else if (b > r) blue += 1;
      else other += 1;
    }
    return { black, blue, other, distinct: seen.size, pixels: (width * height) | 0 };
  });
}

/**
 * Saves the artwork and returns the bytes.
 *
 * Comparisons use the exported image rather than a screenshot of the canvas: the
 * canvas carries overlays and a device pixel ratio, and the export is the
 * artwork itself.
 */
async function save(page: Page, label = '512 × 512') {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const path = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

async function chooseAbyss(page: Page) {
  await (await choice(page, 'Abyss')).click();
  await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);
}

test.describe('Abyss in the studio', () => {
  test.use({ viewport: WIDE });

  test('draws a blue exterior and a black interior, without running anything', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const sent = stub.requests.length;
    await chooseAbyss(page);

    const seen = await inspectCanvas(page);
    expect(seen).not.toBeNull();
    // Both ends present: a void where the count reached its ceiling, and blue
    // where it did not. Neither may swallow the picture.
    expect(seen?.black ?? 0).toBeGreaterThan(0);
    expect(seen?.blue ?? 0).toBeGreaterThan(0);
    expect(seen?.other ?? 0).toBeLessThan((seen?.blue ?? 0) + (seen?.black ?? 0));

    // Presentation only.
    expect(stub.requests.length).toBe(sent);
  });

  test('survives Focus mode and comes back', async ({ page }) => {
    /*
     * Entering Focus mode and leaving it each remount the canvas and redraw a
     * 128² matrix at export size, twice, in the slowest of the two browsers. That
     * had been finishing inside the default assertion timeout until the suite grew
     * past three hundred tests; with both projects contending it began exceeding it
     * — four of six full runs, at this test and at the tiling one below, while
     * passing alone and passing when its own project runs alone.
     *
     * No assertion is relaxed and no wait is lengthened by hand: the work is real
     * and it is given the time it needs, exactly as `tilingExport.spec.ts` does for
     * its eighteen encode-and-decode cycles.
     */
    test.slow();

    await openAndRun(page);
    await chooseAbyss(page);

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);

    await page.keyboard.press('Escape');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);
  });

  test('animates and returns exactly to where it started', async ({ page }) => {
    await openAndRun(page);
    await chooseAbyss(page);
    const atRest = await save(page);

    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
    await page.waitForTimeout(700);
    const moving = await save(page);
    expect(Buffer.compare(moving, atRest)).not.toBe(0);

    /*
     * Reset rather than pause: the interior is allowed to leave black while the
     * ramp moves — that is the point of animating it — so what is checked is
     * that stopping restores the palette exactly, not that black stayed put.
     */
    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Reset animation' }).click();
    await expect(
      (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }),
    ).toBeVisible();

    expect(Buffer.compare(await save(page), atRest)).toBe(0);
  });
});

test.describe('Abyss with repeated copies', () => {
  test.use({ viewport: WIDE });

  test('gives every copy the same colours, repeated and mirrored', async ({ page }) => {
    // Full-canvas pixel reads at several repeat counts, in both orientations. As
    // with the Focus mode test above: legitimate work, given the time it needs.
    test.slow();

    await openAndRun(page);
    await chooseAbyss(page);

    for (const mode of ['Repeat', 'Mirror repeat']) {
      await (await choice(page, mode)).click();
      await (await choice(page, '2 by 2')).click();

      const quadrantsAgree = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const context = canvas?.getContext('2d') ?? null;
        if (canvas === null || context === null) return false;

        /*
         * Compared as histograms rather than pixel by pixel: mirrored copies
         * are reflections, so the same colours appear in different places. A
         * palette applied per copy would change which colours appear at all.
         */
        const half = Math.floor(canvas.width / 2);
        const tally = (x: number) => {
          const { data } = context.getImageData(x, 0, half, Math.floor(canvas.height / 2));
          const counts = new Map<string, number>();
          for (let at = 0; at < data.length; at += 4) {
            const key = `${String(data[at])},${String(data[at + 1])},${String(data[at + 2])}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          return counts;
        };

        const left = tally(0);
        const right = tally(half);
        for (const [key, count] of left) {
          if (Math.abs((right.get(key) ?? 0) - count) > count * 0.2 + 40) return false;
        }
        return true;
      });

      expect(quadrantsAgree, mode).toBe(true);
    }
  });

  test('exports a single tile and a tiling, both in Abyss', async ({ page }) => {
    await openAndRun(page);
    await chooseAbyss(page);

    const single = await save(page);

    await (await choice(page, 'Repeat')).click();
    await (await choice(page, '2 by 2')).click();
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');
    const tiled = await save(page);

    // Both are real PNGs of the size asked for, and they differ because one is
    // a composition.
    for (const png of [single, tiled]) {
      expect(png.readUInt32BE(16)).toBe(512);
      expect(png.readUInt32BE(20)).toBe(512);
    }
    expect(Buffer.compare(single, tiled)).not.toBe(0);

    // And the exported bytes are Abyss rather than the previous default: a
    // black void with blue around it, and no warm colour anywhere.
    const warm = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) return -1;
      context.drawImage(bitmap, 0, 0);

      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let warmPixels = 0;
      for (let at = 0; at < data.length; at += 4) {
        const r = data[at] as number;
        const b = data[at + 2] as number;
        if (r > b + 20) warmPixels += 1;
      }
      return warmPixels;
    }, tiled.toString('base64'));

    expect(warm).toBe(0);
  });
});
