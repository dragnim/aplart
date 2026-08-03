/**
 * Julia Set through the whole application, in a real browser.
 *
 * The point of these is that there is nothing Julia-specific to test. It is a
 * numeric matrix with a declared range, so every presentation feature built for
 * the others should work on it untouched — and if any of them needed a special
 * case for a new fractal, that would be the shared pipeline failing rather than
 * this artwork needing help.
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

async function choose(page: Page, name: string) {
  const control = radio(page, name);
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/julia-set');
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

async function save(page: Page, label = '512 × 512') {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const path = await (await download).path();
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

test.describe('Julia Set', () => {
  test.use({ viewport: WIDE });

  test('runs from its own source and draws its own fractal', async ({ page }) => {
    await openAndRun(page);

    // Its own program, not Mandelbrot's.
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('realC←¯0.8');
    await expect(editor).toContainText('imagC←0.156');
    await expect(editor).toContainText('startR←(size,size)⍴ax');

    // A real result, described by the shared canvas machinery.
    await expect(page.locator('canvas').first()).toHaveAttribute(
      'aria-label',
      /128 by 128 grid with .* ranging from 1 to 48/,
    );
  });

  test('is a different picture from Mandelbrot at the same settings', async ({ page }) => {
    /*
     * The claim the artwork exists to make. Both are 128 cells counted to 48,
     * and the exported bytes differ because two lines of APL differ.
     */
    await openAndRun(page);
    const julia = await save(page);

    await page.goto('./#/art/mandelbrot-field');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    const mandelbrot = await save(page);

    expect(Buffer.compare(julia, mandelbrot)).not.toBe(0);
  });

  test('is answered with Julia’s arithmetic, not Mandelbrot’s', async ({ page }) => {
    /*
     * Guards an ordering requirement in the test stub, and does it through a
     * property of the mathematics rather than by inspecting the stub.
     *
     * Julia declares every parameter name Mandelbrot does, so a stub that checks
     * for the Mandelbrot shape first will answer a Julia run with a Mandelbrot
     * matrix — and the picture would look plausible. Comparing the two artworks'
     * exports would not catch it either, because their default viewports differ
     * and the bytes would differ regardless.
     *
     * What catches it: replacing z by −z leaves z² unchanged, so every Julia set
     * is exactly symmetric about the origin. With the view centred at the origin
     * and the axis sampled symmetrically, the image must be invariant under a
     * 180° rotation. The Mandelbrot set has no such symmetry — it is symmetric
     * about the real axis only — so a Mandelbrot answer fails this outright.
     */
    await openAndRun(page);

    const symmetric = await page.evaluate(
      async (encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (context === null) return { compared: 0, differing: 0 };
        context.drawImage(bitmap, 0, 0);

        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
        let compared = 0;
        let differing = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const here = (y * width + x) * 4;
            const opposite = ((height - 1 - y) * width + (width - 1 - x)) * 4;
            compared += 1;
            for (let channel = 0; channel < 3; channel += 1) {
              if (data[here + channel] !== data[opposite + channel]) {
                differing += 1;
                break;
              }
            }
          }
        }
        return { compared, differing };
      },
      (await save(page)).toString('base64'),
    );

    expect(symmetric.compared).toBeGreaterThan(0);
    expect(symmetric.differing).toBe(0);
  });

  test('takes the presentation features unchanged', async ({ page }) => {
    await openAndRun(page);

    // Palette, display, orientation, and the escape colouring modes.
    await choose(page, 'Abyss');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);
    await choose(page, 'Smooth');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /smooth interpolation/);
    await choose(page, 'Pixel');
    await page.getByLabel('Mode').selectOption('bands');
    await expect(page.getByLabel('Mode')).toHaveValue('bands');

    // Focus mode and back.
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.getByRole('button', { name: 'Focus mode' })).toBeVisible();
  });

  test('reads a cell without claiming it is in the set', async ({ page }) => {
    await openAndRun(page);

    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 200, y: 200 } });

    const panel = page.getByRole('status').filter({ hasText: /Row \d+, column \d+/ });
    await expect(panel).toBeVisible();
    // Whatever this particular cell holds, the wording must never assert
    // membership of the set.
    await expect(page.locator('body')).not.toContainText(/in the julia set|inside the set/iu);
  });

  test('repeats, mirrors and exports both ways', async ({ page }) => {
    await openAndRun(page);
    const single = await save(page);

    // The canvas describes what it drew in its own words — "Mirrored repeat
    // preview" — rather than echoing the control's label.
    for (const [view, described] of [
      ['Repeat', /Repeat preview, 2 columns by 2 rows/],
      ['Mirror repeat', /Mirrored repeat preview, 2 columns by 2 rows/],
    ] as const) {
      await choose(page, view);
      await choose(page, '2 by 2');
      await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', described);
    }

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Export current tiling/ }).click();
    await page.keyboard.press('Escape');
    const tiled = await save(page);

    for (const png of [single, tiled]) {
      expect(png.readUInt32BE(16)).toBe(512);
      expect(png.readUInt32BE(20)).toBe(512);
    }
    expect(Buffer.compare(single, tiled)).not.toBe(0);
  });

  test('drags to zoom without changing which set it is', async ({ page }) => {
    await openAndRun(page);
    const editor = page.locator('.cm-content');

    await page
      .locator('canvas')
      .first()
      .hover({ position: { x: 120, y: 120 } });
    await page.mouse.down();
    await page.mouse.move(320, 320, { steps: 8 });
    await page.mouse.up();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    // The view moved.
    await expect(editor).not.toContainText('zoom←1.3');

    // The constant did not, character for character.
    await expect(editor).toContainText('realC←¯0.8');
    await expect(editor).toContainText('imagC←0.156');
  });

  test('appears in the gallery as its own artwork', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/');

    const card = page.getByRole('article').filter({ hasText: 'Julia Set' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/characters/);
    await expect(card).toContainText(/Intermediate/i);
  });
});
