/**
 * Tricorn through the whole application, in a real browser.
 *
 * Kept to what only a browser can answer: that a visitor can reach the artwork,
 * that it runs and draws, and that the picture is not Mandelbrot's. The
 * mathematics is settled offline against the fixture and against the live
 * service; nothing here re-checks it.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { editorOn, pressRun } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function runAndSettle(page: Page) {
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

test.describe('Tricorn', () => {
  test.use({ viewport: WIDE });

  /*
   * Reachability, asserted by name — the acceptance test the earlier fractals
   * were missing. The gallery's own tests count cards against a number the page
   * itself advertises, so an artwork that never reached the gallery would not fail
   * them.
   */
  test('is in the gallery with a thumbnail, and the card opens the artwork', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/');

    await expect(page.getByRole('heading', { name: 'Tricorn', exact: true })).toBeVisible();
    await expect(page.getByText(/Reversing the sign of the imaginary update/)).toBeVisible();

    const thumbnail = page.locator('img[src*="tricorn"]').first();
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail).toBeVisible();
    expect(await thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Open Tricorn' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tricorn' })).toBeVisible();
    expect(page.url()).toContain('#/art/tricorn');
    await expect(await editorOn(page)).toContainText('ci-2×zr×zi');
  });

  test('opens from its own route, visited directly', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/tricorn');

    await expect(page.getByRole('heading', { level: 1, name: 'Tricorn' })).toBeVisible();
    await expect(await editorOn(page)).toContainText('ci-2×zr×zi');
  });

  test('runs from its own source and draws', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/tricorn');
    await runAndSettle(page);

    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);
    await expect(page.getByText(/Finished in/)).toBeVisible();
    // Its own default view, and its own palette.
    await expect(await editorOn(page)).toContainText('zoom←1.5');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Abyss palette/);
  });

  test('is a different picture from Mandelbrot at the same view', async ({ page }) => {
    await stubTryApl(page);

    await page.goto('./#/art/tricorn');
    await runAndSettle(page);
    const tricorn = await canvasDigest(page);

    /*
     * Mandelbrot moved onto Tricorn's view and palette, so the only difference
     * left between the two runs is the sign in the step. Identical pictures would
     * mean the minus is doing nothing, or that both artworks are being answered by
     * the same arithmetic.
     */
    await page.goto('./#/art/mandelbrot-field');
    const editor = await editorOn(page);
    await expect(editor).toContainText('centreX←¯0.6');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(
      [
        'size←128',
        'iterations←48',
        'centreX←¯0.25',
        'centreY←0',
        'zoom←1.5',
        'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'cr←(size,size)⍴ax',
        'ci←⍉(size,size)⍴ay',
        'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}',
        '⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)',
      ].join('\n'),
    );
    await runAndSettle(page);
    const mandelbrot = await canvasDigest(page);

    expect(tricorn).not.toBe('none');
    expect(mandelbrot).not.toBe('none');
    expect(tricorn).not.toBe(mandelbrot);
  });

  test('drags to zoom without touching the sign', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/tricorn');
    await runAndSettle(page);

    const editor = await editorOn(page);
    await expect(editor).toContainText('zoom←1.5');

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('no canvas');

    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65, { steps: 8 });
    await page.mouse.up();

    // The view assignments changed; the arithmetic did not.
    await expect(editor).not.toContainText('zoom←1.5');
    await expect(editor).toContainText('ci-2×zr×zi');
  });
});
