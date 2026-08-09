/**
 * Burning Ship through the whole application, in a real browser.
 *
 * As with Julia, the point is that there is nothing Burning Ship-specific to
 * test. It returns a numeric matrix with a declared range, so the gallery card,
 * the run, the appearance controls and export should all work on it untouched —
 * and if any of them needed a special case for a new fractal, that would be the
 * shared pipeline failing rather than this artwork needing help.
 *
 * The one claim that is its own is the arithmetic: the same view under Mandelbrot
 * and under Burning Ship must not produce the same picture, or the absolute
 * values would be decoration.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { enterFocus, choice, editorOn, pressRun, showMode } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function choose(page: Page, name: string) {
  // Through the shared helper, which knows that palettes are chosen in Colour
  // and orientation, display and tiling in Advanced.
  const control = await choice(page, name);
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
}

async function openAndRun(page: Page, id = 'burning-ship') {
  await page.goto(`./#/art/${id}`);
  await pressRun(page);
  await expect(runStatus(page).first()).not.toHaveText(/Running/, { timeout: 30_000 });
}

/** The drawn pixels, as a string, so two runs can be compared. */
async function canvasDigest(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 'none';
    return canvas.toDataURL().slice(-2000);
  });
}

test.describe('Burning Ship', () => {
  test.use({ viewport: WIDE });

  /*
   * Reachability, asserted by name.
   *
   * The gallery's own tests count cards against the number a filter chip
   * advertises, and both come from the page — so they agree with each other
   * whatever the registry contains, and an artwork that never reached the gallery
   * would not fail them. Everything else about this artwork was proved by reading
   * its matrix, which says nothing about whether a visitor can get to it. This is
   * the test that says a named artwork is on the front page and opens.
   */
  test('is in the gallery with a thumbnail, and the card opens the artwork', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/');

    await expect(page.getByRole('heading', { name: 'Burning Ship', exact: true })).toBeVisible();
    await expect(page.getByText(/absolute value of each component before squaring/)).toBeVisible();

    // A thumbnail rendered from its own fixture, not a placeholder.
    const thumbnail = page.locator('img[src*="burning-ship"]').first();
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail).toBeVisible();
    expect(await thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    // The card leads to this artwork and not to a neighbour or a not-found page.
    await page.getByRole('link', { name: 'Open Burning Ship' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Burning Ship' })).toBeVisible();
    expect(page.url()).toContain('#/art/burning-ship');
    await expect(await editorOn(page)).toContainText('x←|zr');
  });

  test('opens from its own route, visited directly', async ({ page }) => {
    // The other way in: a shared link, a bookmark, or a typed address, which does
    // not pass through the gallery at all.
    await stubTryApl(page);
    await page.goto('./#/art/burning-ship');

    await expect(page.getByRole('heading', { level: 1, name: 'Burning Ship' })).toBeVisible();
    await expect(await editorOn(page)).toContainText('x←|zr');
  });

  test('runs from its own source and draws its own fractal', async ({ page }) => {
    await stubTryApl(page);
    await openAndRun(page);

    // Its own program, with the absolute values visible in it.
    const editor = await editorOn(page);
    await expect(editor).toContainText('x←|zr');
    await expect(editor).toContainText('y←|zi');
    await expect(editor).toContainText('centreX←¯1.755');

    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);
    await expect(page.getByText(/Finished in/)).toBeVisible();
  });

  test('is a different picture from Mandelbrot at the same view', async ({ page }) => {
    await stubTryApl(page);

    /*
     * Mandelbrot moved onto Burning Ship's default view, so the only remaining
     * difference between the two runs is the step line. If the pictures matched,
     * either the absolute values are doing nothing or the two artworks are being
     * answered by the same arithmetic.
     */
    await openAndRun(page);
    const ship = await canvasDigest(page);

    await page.goto('./#/art/mandelbrot-field');
    const editor = await editorOn(page);
    await expect(editor).toContainText('centreX←¯0.6');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(
      [
        'size←128',
        'iterations←48',
        'centreX←¯1.755',
        'centreY←¯0.02',
        'zoom←0.06',
        'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'cr←(size,size)⍴ax',
        'ci←⍉(size,size)⍴ay',
        'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}',
        '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
      ].join('\n'),
    );
    await pressRun(page);
    await expect(runStatus(page).first()).not.toHaveText(/Running/, { timeout: 30_000 });
    const mandelbrot = await canvasDigest(page);

    expect(ship).not.toBe('none');
    expect(mandelbrot).not.toBe('none');
    expect(ship).not.toBe(mandelbrot);
  });

  test('takes the presentation features unchanged, and for free', async ({ page }) => {
    // One handle, captured once: calling the stub again would register a second
    // route and hand back an empty request list, which would make the count below
    // pass for the wrong reason.
    const stub = await stubTryApl(page);
    await openAndRun(page);
    const afterRun = stub.requests.length;

    await choose(page, 'Abyss');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);
    await choose(page, 'Smooth');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /smooth interpolation/);
    await choose(page, 'Pixel');
    await (await showMode(page, 'Colour')).getByLabel('Mode').selectOption('bands');
    await expect((await showMode(page, 'Colour')).getByLabel('Mode')).toHaveValue('bands');

    // Focus mode and back.
    await enterFocus(page);
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.getByRole('button', { name: 'Focus mode' })).toBeVisible();

    // None of that is a calculation, so none of it reached the service.
    expect(stub.requests.length).toBe(afterRun);
  });

  test('drags to zoom without touching the step line', async ({ page }) => {
    await stubTryApl(page);
    await openAndRun(page);

    const editor = await editorOn(page);
    await expect(editor).toContainText('zoom←0.06');

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('no canvas');

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 8 });
    await page.mouse.up();

    // The view assignments changed; the arithmetic did not.
    await expect(editor).not.toContainText('zoom←0.06');
    await expect(editor).toContainText('x←|zr');
    await expect(editor).toContainText('(x*2)-y*2');
  });
});
