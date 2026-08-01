import { expect, test } from '@playwright/test';

test.describe('site navigation', () => {
  test('the gallery is the home page', async ({ page }) => {
    await page.goto('./');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiny programs.');
    await expect(page).toHaveTitle(/APL Art/);
  });

  test('the main navigation reaches About and Help', async ({ page }) => {
    await page.goto('./');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About APL Art');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Help');
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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiny programs.');
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

    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(7);

    // Every thumbnail is a committed PNG generated from real APL output, so a
    // broken path or a missing file must fail rather than show a gap.
    //
    // They are lazily loaded, which is the point of the attribute: on a phone
    // most of them are still below the fold. Each one is scrolled to before it
    // is checked, rather than assuming the browser has fetched them all.
    const images = page.locator('article img');
    await expect(images).toHaveCount(7);

    for (let index = 0; index < 7; index += 1) {
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

    await page.getByRole('button', { name: /^Fractals/ }).click();
    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('button', { name: /^Beginner/ }).click();
    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByRole('article')).toHaveCount(7);
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
