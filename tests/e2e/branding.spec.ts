/**
 * Palette-responsive branding in a real browser.
 *
 * jsdom can prove where the fourteen properties are set; only a browser can prove
 * that the wordmark's two halves actually paint the colours they name, that the
 * neutral half does not move when the other one does, and that a reduced-motion
 * preference really removes the transition. All of that is read from computed
 * style rather than from a screenshot, so a failure says which colour was wrong.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

/** The default set, as `tokens.css` declares them. */
const DEFAULT_TEXT_ACCENT = 'rgb(170, 80, 38)'; /* #aa5026 */
const LOGO_NEUTRAL = 'rgb(74, 74, 74)'; /* #4a4a4a */

const logo = (page: Page) => page.getByRole('link', { name: 'APL Art' }).locator('svg');

async function fills(page: Page): Promise<{ apl: string; art: string }> {
  const paths = logo(page).locator('path');
  return {
    apl: await paths.nth(0).evaluate((node) => getComputedStyle(node).fill),
    art: await paths.nth(1).evaluate((node) => getComputedStyle(node).fill),
  };
}

/** Every accent property, read from wherever it is inherited from. */
async function tokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const names = [
      '--ui-accent-source',
      '--ui-accent-solid',
      '--ui-accent-solid-hover',
      '--ui-accent-solid-active',
      '--ui-accent-on-solid',
      '--ui-accent-text',
      '--ui-accent-text-on-dark',
      '--ui-accent-border',
      '--ui-accent-border-on-dark',
      '--ui-accent-soft',
      '--ui-accent-soft-on-dark',
      '--ui-accent-focus',
      '--logo-neutral',
      '--logo-neutral-on-dark',
    ];
    const style = getComputedStyle(document.querySelector('[data-accent]') as Element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  });
}

const runStatus = (page: Page) => page.locator('[role="status"][data-status]');

test.describe('palette-responsive branding', () => {
  test.use({ viewport: WIDE });

  test('the whole journey, from gallery to artwork and back', async ({ page }) => {
    const stub = await stubTryApl(page);

    // 1. The gallery uses APL Art's own colours.
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1, name: /Tiny programs/ })).toBeVisible();

    const onGallery = await fills(page);
    expect(onGallery.apl).toBe(LOGO_NEUTRAL);
    expect(onGallery.art).toBe(DEFAULT_TEXT_ACCENT);
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');
    const defaultTokens = await tokens(page);

    // 2. Open an artwork whose palette is nothing like the default.
    await page.goto('./#/art/julia-set');
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();

    // 3. The Art half changes; the APL half does not.
    const onArtwork = await fills(page);
    expect(onArtwork.art).not.toBe(onGallery.art);
    expect(onArtwork.apl).toBe(LOGO_NEUTRAL);
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('palette');

    // Run it, so there is something to disturb later.
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    const afterRun = await runStatus(page).innerText();
    const requestsAfterRun = stub.requests.length;
    expect(requestsAfterRun).toBeGreaterThan(0);

    // 4 and 5. A different palette moves the accent again.
    await page.getByRole('radio', { name: /Neon/ }).click();
    await expect.poll(async () => (await fills(page)).art, { timeout: 5_000 }).not.toBe(onArtwork.art);

    const onNeon = await fills(page);
    expect(onNeon.apl).toBe(LOGO_NEUTRAL);

    // 6 and 7. Focus mode keeps the theme, and runs nothing.
    const before = await tokens(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();

    expect(await tokens(page)).toEqual(before);
    expect(stub.requests.length).toBe(requestsAfterRun);

    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.getByRole('button', { name: 'Focus mode' })).toBeVisible();
    expect(await tokens(page)).toEqual(before);
    // The result the artwork already had is still the one on screen.
    expect(await runStatus(page).innerText()).toBe(afterRun);
    expect(stub.requests.length).toBe(requestsAfterRun);

    // 8 and 9. Help brings back every default.
    // Scoped to the header: the footer links to Help as well.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Help/ })).toBeVisible();

    /*
     * Polled, because the Art fill transitions. Reading it the instant the
     * heading appears catches an interpolated frame part way back to the default
     * — which is the transition doing its job, not a stale theme.
     */
    await expect.poll(async () => (await fills(page)).art, { timeout: 5_000 }).toBe(DEFAULT_TEXT_ACCENT);
    expect((await fills(page)).apl).toBe(LOGO_NEUTRAL);
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');

    // Every property, not just the two the wordmark uses. The custom properties
    // themselves do not transition, so these are exact from the first frame.
    expect(await tokens(page)).toEqual(defaultTokens);
  });

  test('animating the palette does not retheme the interface', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const before = await tokens(page);
    await page.getByRole('button', { name: 'Animate palette' }).click();

    /*
     * Several seconds of real frames. The interface follows the palette
     * definition, so a moving picture must leave every property where it was —
     * this is the assertion that a future "sample the canvas" idea would fail.
     */
    await page.waitForTimeout(1_500);
    expect(await tokens(page)).toEqual(before);
    expect((await fills(page)).apl).toBe(LOGO_NEUTRAL);
  });

  test('the wordmark keeps its shape, and its edges, at every size', async ({ page }) => {
    await page.goto('./#/');
    const svg = logo(page);

    // The source view box, so the proportions are the artwork's own.
    expect(await svg.getAttribute('viewBox')).toBe('0 0 312 113');
    expect(await svg.evaluate((node) => getComputedStyle(node).shapeRendering)).toBe('crispedges');

    // No transform: scaling by transform is what softens pixel edges.
    expect(await svg.evaluate((node) => getComputedStyle(node).transform)).toBe('none');

    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    const { width, height } = box as { width: number; height: number };
    expect(width / height).toBeCloseTo(312 / 113, 1);

    // Nothing clipped: the whole wordmark is inside the header.
    const header = await page.locator('header').boundingBox();
    const logoBox = await svg.boundingBox();
    expect((logoBox as { y: number }).y).toBeGreaterThanOrEqual((header as { y: number }).y);
    expect(
      (logoBox as { y: number; height: number }).y + (logoBox as { height: number }).height,
    ).toBeLessThanOrEqual(
      (header as { y: number; height: number }).y + (header as { height: number }).height,
    );
  });

  test('reduced motion leaves the wordmark no transition to run', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/');

    const art = logo(page).locator('path').nth(1);
    // The central motion tokens collapse to zero, so the duration does too — no
    // separate rule, and nothing to keep in step.
    expect(await art.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  });

  test('the wordmark link keeps a visible focus ring, unclipped', async ({ page, isMobile }) => {
    // Tab does not move focus in mobile Safari, as the other keyboard specs note.
    test.skip(isMobile === true, 'no keyboard focus to move on a touch device');

    await page.goto('./#/');
    const link = page.getByRole('link', { name: 'APL Art' });

    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // the wordmark
    await expect(link).toBeFocused();

    const outline = await link.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset };
    });
    expect(outline.style).toBe('solid');
    expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

    // The ring is drawn outside the link, so the header must not clip it.
    const clipping = await page.locator('header').evaluate((node) => getComputedStyle(node).overflow);
    expect(clipping).toBe('visible');
  });
});
