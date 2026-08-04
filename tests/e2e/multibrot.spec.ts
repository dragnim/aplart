/**
 * Multibrot through the whole application, in a real browser.
 *
 * The exponent is the thing to exercise here, because it is the first control in
 * the project that changes what is computed rather than where it is computed: it
 * must rewrite its own line and nothing else, and it must not disturb the view.
 * The mathematics is settled offline and against the live service.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/**
 * The Power slider.
 *
 * By role, not by label alone: the symbol toolbar has buttons labelled "Insert
 * Power, *" and "Insert Power operator, ⍣", so a label lookup finds three things.
 */
function powerSlider(page: Page) {
  return page.getByRole('slider', { name: 'Power' });
}

async function runAndSettle(page: Page) {
  await page.getByRole('button', { name: /^Run/ }).click();
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

test.describe('Multibrot', () => {
  test.use({ viewport: WIDE });

  test('is in the gallery with a thumbnail, and the card opens the artwork', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/');

    await expect(page.getByRole('heading', { name: 'Multibrot', exact: true })).toBeVisible();
    await expect(page.getByText(/Replace the square with another integer power/)).toBeVisible();

    const thumbnail = page.locator('img[src*="multibrot"]').first();
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail).toBeVisible();
    expect(await thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Open Multibrot' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Multibrot' })).toBeVisible();
    expect(page.url()).toContain('#/art/multibrot');
    await expect(page.locator('.cm-content')).toContainText('power←3');
  });

  test('opens from its own route, visited directly', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/multibrot');

    await expect(page.getByRole('heading', { level: 1, name: 'Multibrot' })).toBeVisible();
    /*
     * A control line, not the step line. CodeMirror renders only the lines in its
     * viewport, and this program is the longest in the gallery — the step is line
     * 25 of 27 and simply is not in the DOM until it is scrolled to. The step is
     * asserted in the unit tests, which read the source rather than the editor.
     */
    await expect(page.locator('.cm-content')).toContainText('power←3');
  });

  test('runs from its own source and draws', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/multibrot');
    await runAndSettle(page);

    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);
    await expect(page.getByText(/Finished in/)).toBeVisible();
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Ember palette/);
  });

  test('the Power control rewrites its own line and leaves the view alone', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/multibrot');
    await runAndSettle(page);

    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('power←3');

    await powerSlider(page).fill('5');
    await expect(editor).toContainText('power←5');

    // Nothing else moved. These are the settings a visitor would be angry to lose.
    for (const untouched of ['size←128', 'iterations←48', 'centreX←0', 'centreY←0', 'zoom←1.4']) {
      await expect(editor, untouched).toContainText(untouched);
    }
  });

  test('changing the Power changes the picture', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/multibrot');
    await runAndSettle(page);
    const cubed = await canvasDigest(page);

    await powerSlider(page).fill('6');
    await expect(page.locator('.cm-content')).toContainText('power←6');
    await runAndSettle(page);
    const sixth = await canvasDigest(page);

    expect(cubed).not.toBe('none');
    expect(sixth).not.toBe(cubed);
  });

  test('is Mandelbrot’s picture at power two', async ({ page }) => {
    /*
     * The equivalence, as a visitor would check it: set the exponent to two, put
     * the view where Mandelbrot's is, and the two artworks draw the same thing.
     * Verified cell for cell against the live service elsewhere; here it is the
     * rendered image, through the whole application.
     */
    await stubTryApl(page);
    await page.goto('./#/art/multibrot');

    const editor = page.locator('.cm-content');
    await powerSlider(page).fill('2');
    await page.getByLabel('Centre across').fill('-0.6');
    await expect(editor).toContainText('power←2');
    await expect(editor).toContainText('centreX←¯0.6');
    await runAndSettle(page);
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Ember palette/);
    const squared = await canvasDigest(page);

    await page.goto('./#/art/mandelbrot-field');
    /*
     * Mandelbrot's own defaults are already this view; only the palette differs, so
     * it is set to match before the pictures are compared — and the change is
     * confirmed rather than assumed. Clicking without checking made this test flaky
     * the moment the page's layout shifted: a click that missed left Mandelbrot in
     * Abyss, and two pictures in different palettes will never match.
     */
    const ember = page.getByRole('radio', { name: 'Ember', exact: true });
    await ember.scrollIntoViewIfNeeded();
    await ember.click();
    await expect(ember).toHaveAttribute('aria-checked', 'true');
    await runAndSettle(page);
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Ember palette/);
    const mandelbrot = await canvasDigest(page);

    expect(squared).not.toBe('none');
    expect(squared).toBe(mandelbrot);
  });
});
