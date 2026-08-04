/**
 * Where a page starts, and where the footer ends.
 *
 * Three faults sat behind one report. Following a link is a hash change, and a
 * hash change scrolls nowhere on its own, so opening an artwork from a scrolled
 * gallery opened it at the gallery's offset. The workspace's lazy placeholder had
 * been hiding that by briefly making the document short enough for the browser to
 * clamp the offset away — so the bug only appeared once the chunk was cached,
 * which is to say on the second artwork a visitor opened.
 *
 * Underneath it, the artwork page really was scrollable far past its own footer:
 * the controls' `visually-hidden` descriptions are absolutely positioned, and with
 * no positioned ancestor they escaped the left column's `overflow` and sat two
 * thousand pixels down the document.
 *
 * And the skip link — the one in-page anchor the site has — navigated to `#main`,
 * which the router read as a path and answered with "We could not find that".
 *
 * Each of those is asserted here, in both browsers, because each was invisible in
 * every other test.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Scrolls the gallery well down and confirms it actually moved. */
async function scrollGalleryDown(page: Page): Promise<number> {
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    window.scrollTo(0, 1200);
  });
  await expect.poll(async () => scrollY(page)).toBeGreaterThan(200);
  return scrollY(page);
}

test.describe('opening a page starts at the top', () => {
  test('an artwork opened from a scrolled gallery starts at the top', async ({ page }) => {
    await stubTryApl(page);

    /*
     * The workspace is visited once first, so its lazily loaded chunk is cached.
     * Without that the placeholder shortens the document, the browser clamps the
     * offset to zero by itself, and this test passes whether or not the fix is
     * present — which is exactly how the fault survived so long.
     */
    await page.goto('./#/art/modular-bloom');
    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto('./#/');
    const from = await scrollGalleryDown(page);
    expect(from).toBeGreaterThan(200);

    await page.getByRole('link', { name: 'Open Mandelbrot Field' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();

    // Settled, not merely momentary: a late layout must not put it back.
    await expect.poll(async () => scrollY(page), { timeout: 5000 }).toBe(0);
    await page.waitForTimeout(400);
    expect(await scrollY(page)).toBe(0);
  });

  test('moving between top-level pages starts at the top', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/');
    await scrollGalleryDown(page);

    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'About APL Art' })).toBeVisible();
    await expect.poll(async () => scrollY(page), { timeout: 5000 }).toBe(0);
  });

  test('Back returns to where the gallery was', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto('./#/');
    const from = await scrollGalleryDown(page);

    await page.getByRole('link', { name: 'Open Mandelbrot Field' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
    await expect.poll(async () => scrollY(page), { timeout: 5000 }).toBe(0);

    await page.goBack();
    await expect(page.getByRole('article').first()).toBeVisible();

    /*
     * The browser's own restoration, deliberately left in place rather than
     * reimplemented. It does not always land on the exact pixel — the gallery's
     * images settle after the restore — so this asserts the visitor is returned to
     * roughly where they were rather than to the top.
     */
    await expect.poll(async () => scrollY(page), { timeout: 5000 }).toBeGreaterThan(Math.round(from / 2));
  });
});

test.describe('the in-page anchor still works', () => {
  test('the skip link moves focus and leaves the page alone', async ({ page, isMobile }) => {
    // iOS Safari does not move focus to links with Tab unless the user has turned
    // that on, which is a platform preference rather than something to assert.
    test.skip(isMobile === true, 'iOS Safari does not tab to links by default.');

    await stubTryApl(page);
    await page.goto('./#/');
    await scrollGalleryDown(page);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');

    // Focus reaches the main landmark, and the gallery is still the gallery.
    await expect(page.locator('main')).toBeFocused();
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByText('We could not find that')).toHaveCount(0);
    expect(await page.evaluate(() => window.location.hash)).toBe('#main');
  });
});

test.describe('the footer sits at the bottom, not in a void', () => {
  test('an artwork page is not scrollable past its own footer', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(400);

    const measured = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      shellHeight: Math.round(
        document.querySelector('main')?.parentElement?.getBoundingClientRect().height ?? 0,
      ),
      footerHeight: Math.round(document.querySelector('footer')?.getBoundingClientRect().height ?? 0),
      innerHeight: window.innerHeight,
    }));

    /*
     * The document may exceed the shell by a rounding pixel or two, never by a
     * screenful. Before the fix this was 3,167 against a shell of 892.
     */
    expect(measured.documentHeight).toBeLessThanOrEqual(
      Math.max(measured.shellHeight, measured.innerHeight) + 4,
    );

    // The footer is itself, not a stretched panel filling the blank area.
    expect(measured.footerHeight).toBeGreaterThan(0);
    expect(measured.footerHeight).toBeLessThan(Math.round(measured.innerHeight * 0.6));
  });

  test('a short page keeps the footer at or below the fold without stretching it', async ({ page }) => {
    await stubTryApl(page);
    // About is the shortest page, and on a tall viewport it cannot fill the screen.
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto('./#/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About APL Art' })).toBeVisible();

    const measured = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      const shell = document.querySelector('main')?.parentElement ?? null;
      return {
        footerBottom: Math.round(footer?.getBoundingClientRect().bottom ?? 0),
        footerHeight: Math.round(footer?.getBoundingClientRect().height ?? 0),
        shellHeight: Math.round(shell?.getBoundingClientRect().height ?? 0),
        innerHeight: window.innerHeight,
      };
    });

    // The shell fills the viewport, so the footer rests at the bottom of it.
    expect(measured.shellHeight).toBeGreaterThanOrEqual(measured.innerHeight - 2);
    expect(measured.footerBottom).toBeGreaterThanOrEqual(measured.innerHeight - 4);

    // And it got there by the main region growing, not by the footer growing.
    expect(measured.footerHeight).toBeLessThan(Math.round(measured.innerHeight * 0.4));
  });
});
