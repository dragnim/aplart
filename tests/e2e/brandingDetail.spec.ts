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
import { advanced, paletteChoice, pressRun, runButton, showMode } from './workspaceModes';

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

/** The wordmark's neutral half, which is what must not follow the artwork. */
const aplHalf = (page: Page) => page.getByRole('link', { name: 'APL Art' }).locator('svg path').first();
const title = (page: Page) => page.locator('h1[class*="title"]');

/**
 * Hides the title's marker, and hands back the means to put it back.
 *
 * Removing it matters: `open()` navigates by hash, which is a same-document
 * navigation, so an injected stylesheet survives into the next iteration of a
 * loop. A test that compares "with" against "without" and forgets to clean up
 * measures "without" against "without" the second time round, and passes.
 */
async function suppressMarker(page: Page, declaration = 'display: none') {
  return page.addStyleTag({
    content: `h1[class*="title"]::before { ${declaration} !important; }`,
  });
}

const restore = async (style: Awaited<ReturnType<typeof suppressMarker>>) => {
  await style.evaluate((node: Element) => {
    node.remove();
  });
};
const runStatus = (page: Page) => page.locator('[role="status"][data-status]');

async function open(page: Page, id: string, heading: string) {
  await stubTryApl(page);
  await page.goto(`./#/art/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('the header brand', () => {
  test.use({ viewport: WIDE });

  test('is the wordmark alone, on every route', async ({ page }) => {
    /*
     * The rounded square holding a ⍴ has gone. It dated from the text wordmark and
     * the pixel logo says the same thing, so the link now holds one mark rather
     * than two competing ones.
     */
    for (const [route, heading] of [
      ['./#/', /Infinite patterns from tiny programs/],
      ['./#/art/julia-set', /Julia Set/],
      ['./#/art/sierpinski-array', /Sierpiński Array/],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

      const brand = page.getByRole('link', { name: 'APL Art' });
      expect(await brand.locator('svg').count(), route).toBe(1);
      expect(await brand.locator('span').count(), route).toBe(0);
      expect((await brand.innerText()).trim(), route).toBe('');
    }
  });

  test('leaves "art" as the only colour up there', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');

    const paths = page.getByRole('link', { name: 'APL Art' }).locator('svg path');
    const apl = await paths.nth(0).evaluate((node) => getComputedStyle(node).fill);
    const art = await paths.nth(1).evaluate((node) => getComputedStyle(node).fill);

    // "apl" holds the neutral; only "art" follows the artwork.
    expect(apl).toBe(await token(page, '--logo-neutral'));
    expect(art).not.toBe(apl);
    expect(art).toBe(await token(page, '--ui-accent-text'));
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
    await (await showMode(page, 'Colour')).getByRole('checkbox', { name: /Invert palette/ }).check();
    expect(await before(title(page), 'background-color')).toBe(teal);

    await (await paletteChoice(page, /Neon/)).click();
    await expect.poll(() => before(title(page), 'background-color'), { timeout: 5_000 }).not.toBe(teal);
    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));
  });

  test('is unmoved by animation frames', async ({ page }) => {
    await open(page, 'mandelbrot-field', 'Mandelbrot Field');
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const settled = await before(title(page), 'background-color');
    await (await showMode(page, 'Animate')).getByRole('button', { name: 'Animate palette' }).click();
    await page.waitForTimeout(1_200);

    expect(await before(title(page), 'background-color')).toBe(settled);
  });

  test('never costs the heading a line, at either width', async ({ page }) => {
    /*
     * The longest title in the gallery, at both widths, compared against itself
     * with the block suppressed. If the block had pushed the heading onto an extra
     * line, removing it would make the heading shorter.
     *
     * Not "one line": how many lines a title takes depends on the font the
     * platform supplies, and an earlier version of this test asserted one line,
     * passed on Windows and failed in CI. What must hold everywhere is that the
     * decoration is not what causes a wrap — on a phone by standing aside, and
     * on a desktop by there being room.
     */
    for (const viewport of [WIDE, NARROW]) {
      await page.setViewportSize(viewport);
      await open(page, 'sierpinski-array', 'Sierpiński Array');

      const heightOf = async () => {
        const box = await title(page).boundingBox();
        return (box as { height: number }).height;
      };

      const withBlock = await heightOf();
      const suppressed = await suppressMarker(page);
      const withoutBlock = await heightOf();
      await restore(suppressed);

      expect(withBlock, `at ${viewport.width}px`).toBeCloseTo(withoutBlock, 0);
      expect(withBlock).toBeGreaterThan(0);
    }
  });

  test('stays visible, clear of the words, and inside the screen at both widths', async ({ page }) => {
    const accent = async () => token(page, '--ui-accent-solid');

    for (const viewport of [WIDE, NARROW]) {
      await page.setViewportSize(viewport);
      await open(page, 'sierpinski-array', 'Sierpiński Array');
      const where = `at ${viewport.width}px`;

      // Visible, and the palette's colour, whichever width.
      expect(await before(title(page), 'background-color'), where).toBe(await accent());
      expect(await before(title(page), 'display'), where).not.toBe('none');
      expect(Number.parseFloat(await before(title(page), 'width')), where).toBeGreaterThan(4);

      /*
       * Painted, not merely declared. Computed style says nothing about where an
       * absolutely positioned marker ends up: the first version of the hanging
       * form measured perfectly and painted against a distant ancestor, because the
       * heading was not its containing block. Comparing the toolbar with and
       * without the marker catches that — if it were painted somewhere else, or not
       * at all, the two images would match.
       */
      const toolbar = page.locator('[class*="toolbar"]').first();
      const painted = await toolbar.screenshot();
      const hidden = await suppressMarker(page, 'visibility: hidden');
      const blank = await toolbar.screenshot();
      await restore(hidden);
      expect(painted.equals(blank), `${where}: the marker must be painted in the toolbar`).toBe(false);

      /*
       * Where the block is relative to the first word. In the flow it precedes the
       * text, so the text must start beyond it; out of flow it hangs to the left,
       * so its right edge must stop before the text begins. Either way they must
       * not share space, and the block must not leave the screen.
       */
      const geometry = await page.evaluate(() => {
        const heading = document.querySelector('h1[class*="title"]') as HTMLElement;
        const style = getComputedStyle(heading, '::before');
        const box = heading.getBoundingClientRect();

        const range = document.createRange();
        range.selectNodeContents(heading);
        const textLeft = range.getClientRects()[0]?.left ?? box.left;

        const width = Number.parseFloat(style.width);
        const offset = style.position === 'absolute' ? Number.parseFloat(style.left) : 0;

        return {
          position: style.position,
          blockLeft: box.left + offset,
          blockRight: box.left + offset + width,
          textLeft,
          titleRight: box.right,
          viewportWidth: window.innerWidth,
        };
      });

      /*
       * The mechanism, not just its effect: on a phone the marker must be out of
       * flow, because that is what makes it unable to break a line whatever the
       * font. Locally, Windows metrics fit the title either way, so without this
       * assertion a regression to the in-flow version would only be caught by
       * whichever platform happens to have a wider face.
       */
      expect(geometry.position, where).toBe(viewport.width <= 480 ? 'absolute' : 'static');

      if (geometry.position === 'absolute') {
        // Hanging: clear of the words to its right, and still on screen.
        expect(geometry.blockRight, where).toBeLessThanOrEqual(geometry.textLeft + 0.5);
        expect(geometry.blockLeft, where).toBeGreaterThanOrEqual(0);
      } else {
        // In the flow: the words start past it, as they always have.
        expect(geometry.textLeft - geometry.blockLeft, where).toBeGreaterThanOrEqual(4);
      }

      // And the heading itself stays inside the screen.
      expect(geometry.titleRight, where).toBeLessThanOrEqual(geometry.viewportWidth + 0.5);
    }
  });

  test('leaves the desktop layout as it was, in the flow before the words', async ({ page }) => {
    await open(page, 'sierpinski-array', 'Sierpiński Array');

    // Unchanged on a wide screen: an inline block with its own margin, so the
    // title text sits indented past it exactly as it did before the phone fix.
    expect(await before(title(page), 'position')).toBe('static');
    expect(await before(title(page), 'display')).toBe('inline-block');
    expect(Number.parseFloat(await before(title(page), 'margin-right'))).toBeGreaterThan(4);
  });
});

test.describe('what stayed neutral', () => {
  test.use({ viewport: WIDE });

  test('section headings carry no marker, and neutral words', async ({ page }) => {
    /*
     * They used to carry a small square in the accent's border tone — a third
     * rank of the wordmark's motif, below the artwork title's own block. It was
     * wayfinding for one long column of controls on a phone, where every section
     * ran into the next; in a short tabbed panel with a title at the top of it,
     * the square had stopped standing for anything and read as an artefact.
     *
     * So the assertion is inverted rather than dropped: the words stay neutral,
     * and there is nothing drawn before them.
     */
    await open(page, 'julia-set', 'Julia Set');
    const text = await token(page, '--text');

    await showMode(page, 'Advanced');
    for (const heading of ['Code controls', 'Appearance']) {
      const node = page.getByRole('heading', { name: heading }).first();
      await expect(node).toHaveCSS('color', text);
      expect(await before(node, 'content'), heading).toBe('none');
    }

    /*
     * The third section only exists once there is a result to read, which makes
     * it the interesting one: a heading rendered long after the theme was applied
     * still inherits it, because the properties live on the shell rather than
     * being painted onto whatever happened to be on screen.
     */
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const later = (await advanced(page)).getByRole('heading', { name: 'Read a value' }).first();
    await expect(later).toBeVisible();
    await expect(later).toHaveCSS('color', text);
    expect(await before(later, 'content')).toBe('none');
  });

  test('nothing below the artwork title carries the motif', async ({ page }) => {
    await open(page, 'julia-set', 'Julia Set');
    const text = await token(page, '--text');

    await showMode(page, 'Colour');
    const legend = page.locator('legend', { hasText: 'Palette' }).first();
    await expect(legend).toHaveCSS('color', text);
    expect(await before(legend, 'content')).toBe('none');

    await showMode(page, 'Code');
    const primitives = page.getByRole('heading', { name: /APL used in this piece/ }).first();
    await expect(primitives).toHaveCSS('color', text);
    expect(await before(primitives, 'content')).toBe('none');
  });

  test('leaves the artwork title as the only heading below the wordmark that carries it', async ({
    page,
  }) => {
    await open(page, 'julia-set', 'Julia Set');

    // The strongest accent token, and now the only heading block in the
    // workspace that uses one.
    expect(await before(title(page), 'background-color')).toBe(await token(page, '--ui-accent-solid'));

    await showMode(page, 'Advanced');
    expect(await before(page.getByRole('heading', { name: 'Appearance' }).first(), 'content')).toBe('none');
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
    await expect(
      page.getByRole('heading', { level: 1, name: /Infinite patterns from tiny programs/ }),
    ).toBeVisible();
    const defaultArt = await page
      .getByRole('link', { name: 'APL Art' })
      .locator('svg path')
      .nth(1)
      .evaluate((node) => getComputedStyle(node).fill);
    const neutralApl = await css(aplHalf(page), 'fill');

    // 2 and 3. One theme family across the logo, the primary control and the title.
    await page.goto('./#/art/julia-set');
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();

    const family = async () => ({
      art: await page
        .getByRole('link', { name: 'APL Art' })
        .locator('svg path')
        .nth(1)
        .evaluate((node) => getComputedStyle(node).fill),
      run: await css(await runButton(page), 'background-color'),
      marker: await before(title(page), 'background-color'),
      source: await token(page, '--ui-accent-source'),
    });

    const teal = await family();
    expect(teal.art).not.toBe(defaultArt);
    expect(teal.art).toBe(await token(page, '--ui-accent-text'));
    expect(teal.run).toBe(await token(page, '--ui-accent-solid'));
    expect(teal.marker).toBe(teal.run);
    expect(await css(aplHalf(page), 'fill')).toBe(neutralApl);

    // 4 and 5. A different palette moves all three together.
    await (await paletteChoice(page, /Heat/)).click();

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
    expect(await css(aplHalf(page), 'fill')).toBe(neutralApl);

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
    await expect(
      page.getByRole('heading', { level: 1, name: /Infinite patterns from tiny programs/ }),
    ).toBeVisible();

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
    expect(await css(aplHalf(page), 'fill')).toBe(neutralApl);
    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');
  });
});
