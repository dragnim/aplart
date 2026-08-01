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

  test('the skip link is the first thing a keyboard user reaches', async ({ page }) => {
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
