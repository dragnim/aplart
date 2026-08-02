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
 * Grey, and grey is the one thing the heat palette never produces: its ramp
 * runs black through purple and orange to near-white, all of them saturated or
 * neutral-at-the-ends. A pixel whose channels agree but is neither black nor
 * white came from the hatch.
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
      const grey = Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2;
      if (grey && r > 20 && r < 200) hatch += 1;
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
