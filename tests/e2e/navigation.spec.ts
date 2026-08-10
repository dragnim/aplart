import { expect, test, type Page } from '@playwright/test';

/**
 * The count a filter chip advertises.
 *
 * Taken from the page rather than from the preset registry, for two reasons. The
 * registry cannot be imported here — a preset imports its APL with `?raw`, which
 * Playwright's transpiler does not understand — and this is the better assertion
 * anyway: the chip claims a number and the gallery renders a list, and the thing
 * worth checking is that they agree. Adding an artwork then needs no edit here.
 */
async function advertised(page: Page, filter: RegExp): Promise<number> {
  const label = (await page.getByRole('button', { name: filter }).textContent()) ?? '';
  // The label carries the number twice — once as the visible badge and once in
  // a phrase for a screen reader, as in "All8, 8 artworks" — so take the first.
  const count = /(\d+)/u.exec(label)?.[1];
  expect(count, `no count in filter label "${label}"`).toBeDefined();
  return Number(count);
}

test.describe('site navigation', () => {
  test('the gallery is the home page', async ({ page }) => {
    await page.goto('./');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Infinite patterns from tiny programs.',
    );
    await expect(page).toHaveTitle(/APL Art/);
  });

  test('the main navigation reaches About and Help', async ({ page }) => {
    await page.goto('./');

    await page.getByRole('button', { name: 'Site menu' }).click();
    await page.getByRole('list', { name: 'Site' }).getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About APL Art');

    await page.getByRole('button', { name: 'Site menu' }).click();
    await page.getByRole('list', { name: 'Site' }).getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help');
  });

  test('the menu is the only way to Game of Life, and it goes there', async ({ page }) => {
    /*
     * Life has no card in the gallery and no site header of its own to come back
     * to, so the menu entry is not a convenience — it is the route. What it lands
     * on is asserted by its own bar rather than by the address alone: an
     * immersive page that had quietly acquired the site chrome would still have
     * the right hash.
     */
    await page.goto('./');

    await page.getByRole('button', { name: 'Site menu' }).click();
    await page.getByRole('list', { name: 'Site' }).getByRole('link', { name: 'Game of Life' }).click();

    /*
     * The Life bar is a `header` inside `main`, which is not a banner — the role
     * belongs to the site header this page deliberately does not render. So it is
     * found as an element rather than by a landmark role, and the landmark's
     * absence is asserted separately below.
     */
    const bar = page.locator('header');
    await expect(bar).toContainText('Conway’s Game of Life');
    await expect(bar).toContainText('APL formulation by John Scholes');
    expect(page.url()).toContain('#/life');

    // Immersive means immersive: no site header, no footer, nothing behind it.
    await expect(page.getByRole('link', { name: 'APL Art' })).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);

    // And a way back that is not the browser's Back button.
    await page.getByRole('link', { name: 'Gallery' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Infinite patterns');
  });

  test('an artwork offers its own way back to the gallery', async ({ page }) => {
    await page.goto('./#/art/basket-weave');
    await expect(page.getByRole('heading', { level: 1, name: 'Basket Weave' })).toBeVisible();

    await page.getByRole('link', { name: 'Gallery', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Infinite patterns');
  });

  test('a hash route opens correctly when visited directly', async ({ page }) => {
    // The point of hash routing: GitHub Pages cannot rewrite unknown paths, so
    // a deep link must resolve without any server involvement.
    await page.goto('./#/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About APL Art');
  });

  test('an unknown route shows a friendly not-found state with a way back', async ({ page }) => {
    await page.goto('./#/no-such-page');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We could not find that');

    await page.getByRole('link', { name: 'Back to the gallery', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Infinite patterns from tiny programs.',
    );
  });

  test('an unknown artwork id shows not found rather than an error', async ({ page }) => {
    await page.goto('./#/art/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We could not find that');
  });

  test('the skip link is the first thing a keyboard user reaches', async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'iOS Safari does not tab to links by default.');

    await page.goto('./');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('the page has no console errors during ordinary use', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('./');
    await page.goto('./#/about');
    await page.goto('./#/help');

    expect(errors).toEqual([]);
  });
});

test.describe('the gallery with every artwork', () => {
  test('shows a card per preset, each with a real thumbnail', async ({ page }) => {
    await page.goto('./');

    const artworks = await advertised(page, /^All/);
    expect(artworks).toBeGreaterThan(0);

    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(artworks);

    // Every thumbnail is a committed PNG generated from real APL output, so a
    // broken path or a missing file must fail rather than show a gap.
    //
    // They are lazily loaded, which is the point of the attribute: on a phone
    // most of them are still below the fold. Each one is scrolled to before it
    // is checked, rather than assuming the browser has fetched them all.
    const images = page.locator('article img');
    await expect(images).toHaveCount(artworks);

    for (let index = 0; index < artworks; index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            image.evaluate((element) => {
              const img = element as HTMLImageElement;
              return img.complete && img.naturalWidth > 0;
            }),
          { message: `thumbnail ${index} never loaded`, timeout: 10_000 },
        )
        .toBe(true);
    }
  });

  test('filters narrow the gallery and every filter leads somewhere', async ({ page }) => {
    await page.goto('./');

    const fractals = await advertised(page, /^Fractals/);
    await page.getByRole('button', { name: /^Fractals/ }).click();
    await expect(page.getByRole('article')).toHaveCount(fractals);

    /*
     * Patterns, where Beginner used to be.
     *
     * That chip selected on the preset's difficulty — a judgement about how hard
     * its APL is to read — in a row of chips that otherwise say what an artwork
     * *is*. Two different questions in one control, and the odd one out was the
     * one making a claim about the visitor. Every filter names a category now.
     */
    const patterns = await advertised(page, /^Patterns/);
    await page.getByRole('button', { name: /^Patterns/ }).click();
    await expect(page.getByRole('article')).toHaveCount(patterns);
    await expect(page.getByRole('button', { name: /^Beginner/ })).toHaveCount(0);

    const all = await advertised(page, /^All/);
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByRole('article')).toHaveCount(all);

    // Every filter leads somewhere: none of them advertises an empty gallery.
    for (const count of [fractals, patterns, all]) expect(count).toBeGreaterThan(0);
  });

  test('every artwork opens', async ({ page }) => {
    await page.goto('./');
    const count = await page.getByRole('link', { name: /^Open/ }).count();

    for (let index = 0; index < count; index += 1) {
      await page.goto('./');
      const link = page.getByRole('link', { name: /^Open/ }).nth(index);
      const label = (await link.getAttribute('aria-label')) ?? (await link.innerText());
      await link.click();
      await expect(page.getByRole('heading', { level: 1 }), `opening ${label}`).not.toHaveText(
        'We could not find that',
      );
    }
  });
});
