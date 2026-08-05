/**
 * The quiet half of the branding, in a real browser.
 *
 * Stage 5's whole claim is one of restraint: the wordmark's "art" is the only
 * strong colour, the artwork title gets one small block, and everything else is
 * either neutral or deliberately unchanged. So most of these assertions are
 * about what did *not* happen — headings that stayed neutral, links that kept
 * the colour documentation depends on, selection that never followed a palette.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };
const NARROW = { width: 390, height: 780 };

/** A custom property, in the rgb() form computed style reports. */
async function token(page: Page, name: string): Promise<string> {
  // The shell may not have rendered yet on a slow first paint, and reading a
  // property off nothing throws rather than failing an assertion.
  await page.locator('[data-accent]').first().waitFor();

  return page.evaluate((property) => {
    const shell = document.querySelector('[data-accent]') as Element;
    const hex = getComputedStyle(shell).getPropertyValue(property).trim();
    const probe = document.createElement('span');
    probe.style.color = hex;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, name);
}

const css = (locator: Locator, property: string) =>
  locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);

/** A pseudo-element's computed value, which is where the title's marker lives. */
const before = (locator: Locator, property: string) =>
  locator.evaluate((node, name) => getComputedStyle(node, '::before').getPropertyValue(name), property);

const mark = (page: Page) => page.locator('header a > span[aria-hidden="true"]');
const title = (page: Page) => page.locator('h1[class*="title"]');
const runStatus = (page: Page) => page.locator('[role="status"][data-status]');

async function open(page: Page, id: string, heading: string) {
  await stubTryApl(page);
  await page.goto(`./#/art/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('the header mark', () => {
  test.use({ viewport: WIDE });

  test('is the wordmark neutral, whatever the artwork is', async ({ page }) => {
    await page.goto('./#/');
    const neutral = await token(page, '--logo-neutral');
    await expect(mark(page)).toHaveCSS('background-color', neutral);

    // Two artworks with unrelated palettes; the square does not move.
    for (const [id, heading] of [
      ['julia-set', 'Julia Set'],
      ['sierpinski-array', 'Sierpiński Array'],
    ] as const) {
      await page.goto(`./#/art/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

      await expect(mark(page)).toHaveCSS('background-color', neutral);
      expect(await css(mark(page), 'background-color')).not.toBe(await token(page, '--ui-accent-solid'));
    }
  });

  test('leaves "art" as the only colour up there', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');

    const paths = page.getByRole('link', { name: 'APL Art' }).locator('svg path');
    const apl = await paths.nth(0).evaluate((node) => getComputedStyle(node).fill);
    const art = await paths.nth(1).evaluate((node) => getComputedStyle(node).fill);
    const square = await css(mark(page), 'background-color');

    // The neutral half and the square agree; only "art" differs.
    expect(square).toBe(apl);
    expect(art).not.toBe(apl);
  });
});

test.describe('the artwork title', () => {
  test.use({ viewport: WIDE });

  test('keeps neutral words and takes one palette-responsive block', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');

    await expect(title(page)).toHaveCSS('color', await token(page, '--text'));
    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));
    expect(await before(title(page), 'content')).toBe('""');
  });

  test('moves with the palette, and only with the palette', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');
    const teal = await before(title(page), 'background-color');

    // A control that is not the palette.
    await page.getByRole('checkbox', { name: /Invert palette/ }).check();
    expect(await before(title(page), 'background-color')).toBe(teal);

    await page.getByRole('radio', { name: /Neon/ }).click();
    await expect.poll(() => before(title(page), 'background-color'), { timeout: 5_000 }).not.toBe(teal);
    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));
  });

  test('is unmoved by animation frames', async ({ page }) => {
    await open(page, 'mandelbrot-field', 'Mandelbrot Field');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const settled = await before(title(page), 'background-color');
    await page.getByRole('button', { name: 'Animate palette' }).click();
    await page.waitForTimeout(1_200);

    expect(await before(title(page), 'background-color')).toBe(settled);
  });

  test('never costs a line of its own, however the title wraps', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await open(page, 'sierpinski-array', 'Sierpiński Array');

    const heightOf = async () => {
      const box = await title(page).boundingBox();
      return (box as { height: number }).height;
    };

    const withBlock = await heightOf();

    /*
     * The same heading with the block suppressed. If the block had pushed the
     * title onto an extra line, removing it would make the heading shorter — so
     * equal heights is the property worth asserting, and it holds whatever the
     * text does.
     *
     * Not "one line": how many lines a long title takes depends on the font the
     * platform supplies. An earlier version of this test asserted one line, passed
     * on Windows and failed in CI, where a wider fallback face wraps "Sierpiński
     * Array" in a 390px header — which is fine, and not what this test is about.
     */
    await page.addStyleTag({ content: 'h1[class*="title"]::before { display: none !important; }' });
    const withoutBlock = await heightOf();

    expect(withBlock).toBeCloseTo(withoutBlock, 0);
    expect(withBlock).toBeGreaterThan(0);
  });

  test('still paints its block at mobile width', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await open(page, 'sierpinski-array', 'Sierpiński Array');

    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));
  });
});

test.describe('what stayed neutral', () => {
  test.use({ viewport: WIDE });

  test('section headings take the quiet marker, with neutral words', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');
    const text = await token(page, '--text');
    const quiet = await token(page, '--ui-accent-border');

    for (const heading of ['Code controls', 'Appearance']) {
      const node = page.getByRole('heading', { name: heading }).first();
      await expect(node).toHaveCSS('color', text);
      expect(await before(node, 'background-color'), heading).toBe(quiet);
    }

    /*
     * The third section only exists once there is a result to read, which makes
     * it the interesting one: a heading rendered long after the theme was applied
     * still inherits it, because the properties live on the shell rather than
     * being painted onto whatever happened to be on screen.
     */
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const later = page.getByRole('heading', { name: 'Read a value' }).first();
    await expect(later).toBeVisible();
    await expect(later).toHaveCSS('color', text);
    expect(await before(later, 'background-color')).toBe(quiet);
  });

  test('the marker stops at the section headings', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');
    const text = await token(page, '--text');

    // A group legend and the primitive reference: both plain, so the motif marks
    // where a section begins rather than becoming a texture.
    for (const node of [
      page.locator('legend', { hasText: 'Palette' }).first(),
      page.getByRole('heading', { name: /APL used in this piece/ }).first(),
    ]) {
      await expect(node).toHaveCSS('color', text);
      expect(await before(node, 'content')).toBe('none');
    }
  });

  test('keeps the hierarchy: the title block outranks a section block', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');

    const blockWidth = (locator: Locator) =>
      locator.evaluate((node) => Number.parseFloat(getComputedStyle(node, '::before').width));

    expect(await blockWidth(title(page))).toBeGreaterThan(
      await blockWidth(page.getByRole('heading', { name: 'Appearance' }).first()),
    );

    // And the stronger of the two accent tokens belongs to the title.
    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));
    expect(await before(page.getByRole('heading', { name: 'Appearance' }).first(), 'background-color')).toBe(
      await token(page, '--ui-accent-border'),
    );
  });

  test('Help and About keep their own appearance', async ({ page }) => {
    await page.goto('./#/help');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', await token(page, '--text'));
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');
  });

  test('links keep the colour documentation depends on, even on an artwork route', async ({ page }) => {
    await page.goto('./#/help');
    const stable = await css(page.locator('main a').first(), 'color');
    expect(stable).toBe(await token(page, '--accent-orange-strong'));

    await open(page, 'julia-set', 'Julia Set');

    // The footer is inside the themed shell, and its links still do not follow
    // the artwork: the same link must not change colour with the page.
    const footerLink = page.locator('footer a').first();
    expect(await css(footerLink, 'color')).toBe(stable);
    expect(await css(footerLink, 'color')).not.toBe(await token(page, '--ui-accent-text'));
  });

  test('a broken share link is announced without the palette', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/julia-set?s=%21%21broken');
    await expect(page.getByText(/could not be opened/)).toBeVisible();

    const notice = page.locator('[class*="shareNotice"]');
    expect(await css(notice, 'border-left-color')).toBe(await token(page, '--border-strong'));
    for (const name of ['--ui-accent-solid', '--ui-accent-border', '--ui-accent-text']) {
      expect(await css(notice, 'border-left-color')).not.toBe(await token(page, name));
    }
  });

  test('text selection is the same colour on every route', async ({ page }) => {
    const selection = (target: Page) =>
      target.evaluate(() => getComputedStyle(document.body, '::selection').backgroundColor);

    await page.goto('./#/');
    const onGallery = await selection(page);

    await open(page, 'sierpinski-array', 'Sierpiński Array');
    expect(await selection(page)).toBe(onGallery);
  });
});

test.describe('Focus mode', () => {
  test.use({ viewport: WIDE });

  test('is calmer than the workspace, and uses the dark variants', async ({ page }) => {
    await open(page, 'mandelbrot-field', 'Mandelbrot Field');
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();

    // The title over the artwork: dark-surface text, and no marker of its own.
    const overlayTitle = page.locator('h2[class*="title"]').first();
    await expect(overlayTitle).toHaveCSS('color', await token(page, '--text-on-dark'));
    expect(await before(overlayTitle, 'content')).toBe('none');

    // The drawer is a light surface even here, so its heading is the light neutral.
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    const drawerTitle = page.getByRole('heading', { name: 'Controls' }).filter({ visible: true }).first();
    await expect(drawerTitle).toHaveCSS('color', await token(page, '--text'));
  });
});

test.describe('forced colours', () => {
  test.use({ viewport: WIDE });

  test('the title and its structure survive', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page, 'julia-set', 'Julia Set');

    // The words are what carry the title; the block is decoration that may be
    // overridden by the system without anything being lost.
    await expect(title(page)).toHaveText('Julia Set');
    const box = await title(page).boundingBox();
    expect((box as { width: number }).width).toBeGreaterThan(50);
  });
});

test.describe('the coherence journey', () => {
  test.use({ viewport: WIDE });

  test('gallery, artwork, palette change, Focus mode, and back', async ({ page }) => {
    const stub = await stubTryApl(page);

    // 1. The default header.
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1, name: /Tiny programs/ })).toBeVisible();
    const defaultArt = await page
      .getByRole('link', { name: 'APL Art' })
      .locator('svg path')
      .nth(1)
      .evaluate((node) => getComputedStyle(node).fill);
    const neutralMark = await css(mark(page), 'background-color');

    // 2 and 3. One theme family across the logo, the primary control and the title.
    await page.goto('./#/art/julia-set');
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();

    const family = async () => ({
      art: await page
        .getByRole('link', { name: 'APL Art' })
        .locator('svg path')
        .nth(1)
        .evaluate((node) => getComputedStyle(node).fill),
      run: await css(page.getByRole('button', { name: /^Run/ }), 'background-color'),
      marker: await before(title(page), 'background-color'),
      source: await token(page, '--ui-accent-source'),
    });

    const teal = await family();
    expect(teal.art).not.toBe(defaultArt);
    expect(teal.art).toBe(await token(page, '--ui-accent-text'));
    expect(teal.run).toBe(await token(page, '--ui-accent-solid'));
    expect(teal.marker).toBe(teal.run);
    expect(await css(mark(page), 'background-color')).toBe(neutralMark);

    // 4 and 5. A different palette moves all three together.
    await page.getByRole('radio', { name: /Heat/ }).click();

    /*
     * Polled on the wordmark rather than on the title's block: the block is a
     * background that changes at once, while the fill transitions over the motion
     * token, so the fill is the slower of the two and the one worth waiting for.
     */
    await expect
      .poll(
        async () => {
          const painted = (await family()).art;
          const expected = await token(page, '--ui-accent-text');
          return painted === expected ? 'agrees' : `${painted} vs ${expected}`;
        },
        { timeout: 5_000 },
      )
      .toBe('agrees');

    const heat = await family();
    expect(heat.art).toBe(await token(page, '--ui-accent-text'));
    expect(heat.run).toBe(await token(page, '--ui-accent-solid'));
    expect(heat.marker).toBe(heat.run);
    expect(heat.source).not.toBe(teal.source);
    expect(await css(mark(page), 'background-color')).toBe(neutralMark);

    // 6. And a general link is untouched by any of it.
    expect(await css(page.locator('footer a').first(), 'color')).toBe(
      await token(page, '--accent-orange-strong'),
    );

    // 7 and 8. Focus mode: restrained, dark variants, nothing rerun.
    const runs = stub.requests.length;
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();

    const overlayTitle = page.locator('h2[class*="title"]').first();
    await expect(overlayTitle).toHaveCSS('color', await token(page, '--text-on-dark'));
    expect(await before(overlayTitle, 'content')).toBe('none');
    expect(stub.requests.length).toBe(runs);

    await page.getByRole('button', { name: 'Exit focus' }).click();

    // 9 and 10. The gallery is itself again.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gallery' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Tiny programs/ })).toBeVisible();

    await expect
      .poll(
        async () =>
          page
            .getByRole('link', { name: 'APL Art' })
            .locator('svg path')
            .nth(1)
            .evaluate((node) => getComputedStyle(node).fill),
        { timeout: 5_000 },
      )
      .toBe(defaultArt);
    expect(await css(mark(page), 'background-color')).toBe(neutralMark);
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');
  });
});
