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
import { enterFocus, choice, pressRun, showMode } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/**
 * Selects a radio, having first brought it into view.
 *
 * On the narrow layout the appearance controls are a long scrolling column, and
 * a plain click has to wait for the element to be both visible and stable.
 * Under parallel load that occasionally exceeded the timeout — an intermittent
 * failure of the test rather than of the control.
 */
async function choose(page: Page, name: string) {
  const control = await choice(page, name);
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/mandelbrot-field');
  await pressRun(page);
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

/**
 * Distinct colours in a PNG, decoded in the page.
 *
 * `margin` is a fraction of each side to ignore. Canvas smoothing samples
 * outside the image at its border, so the outermost pixels of a scaled-up
 * export can blend towards transparency — an edge artefact of the filter, not
 * something about the matrix. Excluding a margin asks about the picture rather
 * than about its frame.
 */
async function coloursIn(page: Page, png: Buffer, margin = 0) {
  return page.evaluate(
    async ([encoded, inset]) => {
      const bytes = Uint8Array.from(atob(encoded as string), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) return -1;
      context.drawImage(bitmap, 0, 0);

      const skip = Math.max(0, Math.floor(canvas.width * (inset as number)));
      const width = canvas.width - skip * 2;
      const height = canvas.height - skip * 2;
      if (width <= 0 || height <= 0) return -1;

      const { data } = context.getImageData(skip, skip, width, height);
      const seen = new Set<number>();
      for (let at = 0; at < data.length; at += 4) {
        seen.add(((data[at] as number) << 16) | ((data[at + 1] as number) << 8) | (data[at + 2] as number));
      }
      return seen.size;
    },
    [png.toString('base64'), margin] as const,
  );
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
    await choose(page, 'Smooth');
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
    await choose(page, 'Pixel');
    expect(await distinctColours(page)).toBeLessThan(softened / 2);
  });

  test('asks the service for nothing', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const sent = stub.requests.length;
    await choose(page, 'Smooth');
    await choose(page, 'Pixel');
    await choose(page, 'Smooth');

    expect(stub.requests.length).toBe(sent);
  });

  test('is kept in Focus mode and on the way back', async ({ page }) => {
    await openAndRun(page);
    await choose(page, 'Smooth');

    await enterFocus(page);
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
    await choose(page, 'Pixel');
    const crisp = await distinctColours(page);
    expect(softened).toBeGreaterThan(crisp * 2);
  });

  test('applies to every copy of a repeat, not just the first', async ({ page }) => {
    await openAndRun(page);
    await choose(page, 'Smooth');
    await choose(page, 'Repeat');
    await choose(page, '2 by 2');

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');

    for (const view of ['Repeat', 'Mirror repeat']) {
      await choose(page, view);

      /*
       * Compared in the exported composition rather than on screen. The canvas
       * is letterboxed inside its box — more so on a narrow viewport — so its
       * halves are not where the copies meet, and comparing them measures the
       * layout instead of the display mode.
       *
       * Counted per half. A copy drawn crisply beside a softened one would hold
       * far fewer distinct colours, whichever way it was reflected.
       */
      const halvesAgree = await page.evaluate(
        async (encoded) => {
          const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (context === null) return false;
          context.drawImage(bitmap, 0, 0);

          const half = Math.floor(canvas.width / 2);
          const count = (x: number) => {
            const { data } = context.getImageData(x, 0, half, canvas.height);
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
        },
        (await save(page)).toString('base64'),
      );

      expect(halvesAgree, view).toBe(true);
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
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    // Confirmed flat by the interface's own account of it before measuring.
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /every cell holds the value/);

    /*
     * Measured in the exported image rather than on screen. The canvas is
     * letterboxed inside its box, and with smoothing enabled WebKit blends the
     * artwork's outer edge with the backdrop behind it — a real effect at the
     * border, and nothing to do with whether the matrix has detail in it. The
     * export is the artwork at exact size with no surround, so it answers the
     * question actually being asked.
     */
    for (const display of ['Pixel', 'Smooth']) {
      await choose(page, display);
      // Two per cent of each side ignored, which is the filter's edge and
      // nothing more. Everything inside it must be the one colour.
      expect(await coloursIn(page, await save(page), 0.02), display).toBe(1);
    }
  });

  test('keeps one animation phase across every copy in both modes', async ({ page }) => {
    await openAndRun(page);
    await choose(page, 'Repeat');
    await choose(page, '2 by 2');

    // Turned on once. It persists, and toggling it per pass would mean opening
    // the menu twice as often for no gain.
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');

    for (const display of ['Pixel', 'Smooth']) {
      await choose(page, display);

      await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Pause' }).click();

      /*
       * Compared in the exported composition, not on screen. The four copies
       * come from one prepared tile, so a phase read per copy would show the
       * quadrants disagreeing — but the on-screen canvas is letterboxed inside
       * its box, so its halves are not the copy boundaries. The export is the
       * composition at exact size, where they are.
       *
       * Paused first so both halves are read from the same frame.
       */
      const quadrantsAgree = await page.evaluate(
        async (encoded) => {
          const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (context === null) return false;
          context.drawImage(bitmap, 0, 0);

          const half = Math.floor(canvas.width / 2);
          const quarter = Math.floor(canvas.height / 2);
          const left = context.getImageData(0, 0, half, quarter).data;
          const right = context.getImageData(half, 0, half, quarter).data;
          for (let at = 0; at < left.length; at += 4) {
            if (Math.abs((left[at] as number) - (right[at] as number)) > 6) return false;
          }
          return true;
        },
        (await save(page)).toString('base64'),
      );

      expect(quadrantsAgree, display).toBe(true);
    }
  });
});

test.describe('Pixel and Smooth in the exported image', () => {
  test.use({ viewport: WIDE });

  test('reaches a single-tile export', async ({ page }) => {
    await openAndRun(page);
    const crisp = await save(page);

    await choose(page, 'Smooth');
    const softened = await save(page);

    expect(Buffer.compare(softened, crisp)).not.toBe(0);
    expect(await coloursIn(page, softened)).toBeGreaterThan(await coloursIn(page, crisp));
  });

  test('reaches a tiled export', async ({ page }) => {
    await openAndRun(page);
    await choose(page, 'Repeat');
    await choose(page, '2 by 2');

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');

    const crisp = await save(page);
    await choose(page, 'Smooth');
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
