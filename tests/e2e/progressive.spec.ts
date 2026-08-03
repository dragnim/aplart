/**
 * A banded run arriving in a real browser.
 *
 * jsdom can prove the reducer keeps the delivery and the artwork apart. Only a
 * browser can show that the half-delivered canvas reads as half-delivered
 * rather than as an artwork with a large black region in it.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/**
 * How much of the canvas is the "not here yet" hatch.
 *
 * The hatch is a translucent grey laid over the palette background, so a hatched
 * pixel is nearly neutral and neither black nor white. No colour in either
 * Mandelbrot palette is: Heat runs black through purple and orange to
 * near-white, and Abyss runs deep blue through cyan to pure black — every stop
 * of both is either saturated or at an extreme of brightness.
 *
 * "Nearly" neutral rather than exactly, and this is what the test originally got
 * wrong: it required the channels to agree within two, which held while the
 * background was Heat's `#000004` and stopped holding the moment the default
 * became Abyss, whose `#05070f` background gives the composited hatch a faint
 * blue cast. The hatch was perfectly visible; the measurement was tuned to one
 * palette.
 */
async function hatchFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 0;
    const context = canvas.getContext('2d');
    if (context === null) return 0;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let hatch = 0;
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] as number;
      const g = data[index + 1] as number;
      const b = data[index + 2] as number;
      total += 1;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      if (spread <= 12 && brightness > 18 && brightness < 200) hatch += 1;
    }
    return total === 0 ? 0 : hatch / total;
  });
}

/**
 * Waits for a canvas with no hatch left on it.
 *
 * Polled rather than read once: the status region changes state a frame before
 * the canvas is repainted, so asking the instant the run reports finished can
 * catch the last band still unpainted.
 */
async function expectWhole(page: Page) {
  await expect.poll(() => hatchFraction(page), { timeout: 15_000 }).toBeLessThan(0.005);
}

test.describe('a banded run arriving', () => {
  test.use({ viewport: WIDE });

  test('shows the artwork building up, with the rest marked as absent', async ({ page }) => {
    await stubTryApl(page, { delayMs: 400 });
    await page.goto('./#/art/mandelbrot-field');
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();

    await page.getByRole('button', { name: /^Run/ }).click();

    // Part-way through, a good share of the canvas is hatched.
    await expect.poll(() => hatchFraction(page), { timeout: 20_000 }).toBeGreaterThan(0.05);

    // The status says something, and says it in quarters rather than bands.
    await expect(runStatus(page)).toHaveText(/Running/);

    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    /*
     * Finished, so every cell has a value and none of the hatch is left. A
     * complete artwork must not have a single pixel of "still loading" in it.
     */
    await expectWhole(page);
  });

  test('puts the whole artwork back when a delivery is stopped', async ({ page }) => {
    /*
     * A wide window on purpose. Catching a specific fraction of the delivery
     * before pressing Stop made this depend on how loaded the machine was, and
     * a test that fails for that reason teaches nothing. Slow bands instead, so
     * Stop always lands mid-delivery whatever else is running.
     */
    await stubTryApl(page, { delayMs: 1200 });
    await page.goto('./#/art/mandelbrot-field');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 60_000 });
    await expectWhole(page);

    // A second run, stopped as soon as it can be.
    await page.getByRole('button', { name: /^Run/ }).click();
    const stop = page.getByRole('button', { name: 'Stop' });
    await stop.click();

    await expect(runStatus(page)).toHaveText(/Stopped/, { timeout: 30_000 });

    // Whole again: stopping restores the last complete artwork rather than
    // leaving half of one on screen.
    await expectWhole(page);
  });
});
