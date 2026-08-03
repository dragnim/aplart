/**
 * Pixel and Smooth, where the pixels are real.
 *
 * The only way to show that Pixel is nearest-neighbour and Smooth is
 * interpolation is to count colours in a rendered canvas: interpolation invents
 * intermediate colours between cells, and nearest-neighbour cannot. Everything
 * else here follows from that one fact — that the choice reaches the export, that
 * it reaches every copy of a repeat, and that it never asks the service for
 * anything.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

function radio(page: Page, name: string) {
  return page.getByRole('radio', { name, exact: true });
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/mandelbrot-field');
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

/** How many distinct colours the drawn canvas contains. */
async function distinctColours(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null) return -1;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set<number>();
    for (let at = 0; at < data.length; at += 4) {
      seen.add(((data[at] as number) << 16) | ((data[at + 1] as number) << 8) | (data[at + 2] as number));
    }
    return seen.size;
  });
}

async function save(page: Page, label = '512 × 512') {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const path = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

/** Distinct colours in a PNG, decoded in the page. */
async function coloursIn(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) return -1;
    context.drawImage(bitmap, 0, 0);

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set<number>();
    for (let at = 0; at < data.length; at += 4) {
      seen.add(((data[at] as number) << 16) | ((data[at + 1] as number) << 8) | (data[at + 2] as number));
    }
    return seen.size;
  }, png.toString('base64'));
}

test.describe('Pixel and Smooth on screen', () => {
  test.use({ viewport: WIDE });

  test('Pixel keeps the matrix’s own colours; Smooth invents ones between them', async ({ page }) => {
    await openAndRun(page);

    /*
     * The distinction, measured. A 128-cell matrix drawn at nearest-neighbour
     * can only contain the colours its values map to. Interpolating between
     * cells produces colours no cell holds, so the count rises sharply — and
     * that rise is the whole of what Smooth does.
     */
    const crisp = await distinctColours(page);
    await radio(page, 'Smooth').click();
    const softened = await distinctColours(page);

    expect(crisp).toBeGreaterThan(0);
    expect(softened).toBeGreaterThan(crisp * 2);

    /*
     * And back again. Compared as a ratio rather than as the same number: on the
     * narrow layout the controls live behind a tab, so reaching them changes
     * which panel is on screen and the canvas is laid out at another size. What
     * has to hold is that Pixel is once again drawing only the colours the
     * matrix maps to.
     */
    await radio(page, 'Pixel').click();
    expect(await distinctColours(page)).toBeLessThan(softened / 2);
  });

  test('asks the service for nothing', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const sent = stub.requests.length;
    await radio(page, 'Smooth').click();
    await radio(page, 'Pixel').click();
    await radio(page, 'Smooth').click();

    expect(stub.requests.length).toBe(sent);
  });

  test('is kept in Focus mode and on the way back', async ({ page }) => {
    await openAndRun(page);
    await radio(page, 'Smooth').click();

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /smooth interpolation/);

    // Exit explicitly: Escape closes the drawer before it leaves Focus mode, so
    // one press would still be in Focus with no Display control on screen.
    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /smooth interpolation/);

    /*
     * Measured as a ratio at the size the canvas is now, not against the count
     * from before. Focus mode gives the artwork the whole window, so the canvas
     * is a different size on the way back and interpolates across a different
     * number of pixels — comparing the two counts would be comparing layouts,
     * not display modes.
     */
    const softened = await distinctColours(page);
    await radio(page, 'Pixel').click();
    const crisp = await distinctColours(page);
    expect(softened).toBeGreaterThan(crisp * 2);
  });

  test('applies to every copy of a repeat, not just the first', async ({ page }) => {
    await openAndRun(page);
    await radio(page, 'Smooth').click();

    for (const view of ['Repeat', 'Mirror repeat']) {
      await radio(page, view).click();
      await radio(page, '2 by 2').click();

      const quadrantsAgree = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const context = canvas?.getContext('2d') ?? null;
        if (canvas === null || context === null) return false;

        /*
         * Counted per quadrant. A copy drawn crisply beside a softened one
         * would hold far fewer distinct colours, whichever way it was
         * reflected.
         */
        const half = Math.floor(canvas.width / 2);
        const quarter = Math.floor(canvas.height / 2);
        const count = (x: number) => {
          const { data } = context.getImageData(x, 0, half, quarter);
          const seen = new Set<number>();
          for (let at = 0; at < data.length; at += 4) {
            seen.add(
              ((data[at] as number) << 16) | ((data[at + 1] as number) << 8) | (data[at + 2] as number),
            );
          }
          return seen.size;
        };

        const left = count(0);
        const right = count(half);
        return Math.abs(left - right) < Math.max(left, right) * 0.25;
      });

      expect(quadrantsAgree, view).toBe(true);
    }
  });
});

test.describe('what neither mode may do', () => {
  test.use({ viewport: WIDE });

  test('leaves a flat result flat, crisp or interpolated', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');

    /*
     * A view deep inside the set, where every point reaches the ceiling. There
     * is nothing between the cells to interpolate, so softening must not
     * conjure variation — the one case where a display mode could most
     * plausibly look like it had calculated something.
     */
    // Home takes the range to its minimum. The default centre is already inside
    // the main cardioid, so the smallest span is entirely interior.
    await page.getByLabel('Span').press('Home');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    // Confirmed flat by the interface's own account of it before measuring.
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /every cell holds the value/);

    for (const display of ['Pixel', 'Smooth']) {
      await radio(page, display).click();
      expect(await distinctColours(page), display).toBe(1);
    }
  });

  test('keeps one animation phase across every copy in both modes', async ({ page }) => {
    await openAndRun(page);

    for (const display of ['Pixel', 'Smooth']) {
      await radio(page, display).click();
      await radio(page, 'Repeat').click();
      await radio(page, '2 by 2').click();

      await page.getByRole('button', { name: 'Animate palette' }).click();
      await page.waitForTimeout(600);

      /*
       * The copies come from one prepared tile, so a phase read per copy would
       * show the quadrants disagreeing. Compared while it is still running,
       * which is when they would.
       */
      const quadrantsAgree = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const context = canvas?.getContext('2d') ?? null;
        if (canvas === null || context === null) return false;

        const half = Math.floor(canvas.width / 2);
        const quarter = Math.floor(canvas.height / 2);
        const left = context.getImageData(0, 0, half, quarter).data;
        const right = context.getImageData(half, 0, half, quarter).data;
        for (let at = 0; at < left.length; at += 4) {
          if (Math.abs((left[at] as number) - (right[at] as number)) > 6) return false;
        }
        return true;
      });

      expect(quadrantsAgree, display).toBe(true);
      await page.getByRole('button', { name: 'Reset animation' }).click();
    }
  });
});

test.describe('Pixel and Smooth in the exported image', () => {
  test.use({ viewport: WIDE });

  test('reaches a single-tile export', async ({ page }) => {
    await openAndRun(page);
    const crisp = await save(page);

    await radio(page, 'Smooth').click();
    const softened = await save(page);

    expect(Buffer.compare(softened, crisp)).not.toBe(0);
    expect(await coloursIn(page, softened)).toBeGreaterThan(await coloursIn(page, crisp));
  });

  test('reaches a tiled export', async ({ page }) => {
    await openAndRun(page);
    await radio(page, 'Repeat').click();
    await radio(page, '2 by 2').click();

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');

    const crisp = await save(page);
    await radio(page, 'Smooth').click();
    const softened = await save(page);

    expect(Buffer.compare(softened, crisp)).not.toBe(0);
    expect(await coloursIn(page, softened)).toBeGreaterThan(await coloursIn(page, crisp));
  });

  test('names the matrix the image is drawn from', async ({ page }) => {
    await openAndRun(page);
    await page.getByRole('button', { name: 'Export' }).click();

    // The preset asks for 128 cells, and an export can be several times that
    // many pixels. Saying so is the honest way to offer both.
    await expect(page.getByText(/Source matrix: 128 × 128/)).toBeVisible();
  });
});
