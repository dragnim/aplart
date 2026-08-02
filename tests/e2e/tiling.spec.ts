/**
 * Repeating the artwork in a real browser.
 *
 * jsdom can prove the reducer and the geometry agree. Only a browser can show
 * that the copies actually meet: a half-pixel gap between tiles is invisible to
 * every assertion about state and is the first thing somebody previewing a
 * repeating pattern would notice.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/truchet-grid');
  await expect(page.getByRole('heading', { level: 1, name: 'Truchet Grid' })).toBeVisible();
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

/**
 * Looks for a gap between copies by scanning for a fully background-coloured
 * line running the height of the artwork.
 *
 * A seam shows up as an unbroken column of background where the tiles fail to
 * meet. The artwork itself has plenty of background pixels, so the test is
 * whether an entire column is background — which a dense Truchet tiling never
 * produces on its own.
 */
async function backgroundColumns(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return -1;
    const context = canvas.getContext('2d');
    if (context === null) return -1;

    const { width, height } = canvas;
    const { data } = context.getImageData(0, 0, width, height);

    // The artwork occupies a centred square; only look inside it, so the
    // letterboxed mat either side is not counted as a seam.
    const size = Math.min(width, height);
    const left = Math.floor((width - size) / 2);
    const top = Math.floor((height - size) / 2);
    const inset = Math.floor(size * 0.02);

    let empty = 0;
    for (let x = left + inset; x < left + size - inset; x += 1) {
      let allBackground = true;
      for (let y = top + inset; y < top + size - inset && allBackground; y += 2) {
        const at = (y * width + x) * 4;
        const r = data[at] as number;
        const g = data[at + 1] as number;
        const b = data[at + 2] as number;
        // The Truchet arcs are near-white; anything bright is artwork.
        if (r > 90 || g > 90 || b > 90) allBackground = false;
      }
      if (allBackground) empty += 1;
    }
    return empty;
  });
}

test.describe('repeating the artwork', () => {
  test.use({ viewport: WIDE });

  test('fills the artwork with copies and leaves no gap between them', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/truchet-grid');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const singleEmpty = await backgroundColumns(page);
    const sent = stub.requests.length;

    for (const count of ['2 by 2', '3 by 3', '5 by 5']) {
      await page.getByRole('radio', { name: 'Repeat' }).click();
      await page.getByRole('radio', { name: count }).click();
      await page.waitForTimeout(300);

      /*
       * No more empty columns than a single copy already has. A seam would add
       * one per tile boundary, which at 5 × 5 is four unmistakable lines.
       */
      expect(await backgroundColumns(page), count).toBeLessThanOrEqual(singleEmpty);
    }

    // Not one request for any of it: this is the same result drawn again.
    expect(stub.requests.length).toBe(sent);
  });

  test('works in Focus mode, where the repeat is the point', async ({ page }) => {
    await openAndRun(page);

    /*
     * Focus mode opens the drawer itself — arriving with no visible controls
     * leaves someone looking at a picture with no way in — so pressing Controls
     * here would close it. Asked rather than assumed, because either default is
     * reasonable and a test that hard-codes one breaks when it changes.
     */
    await page.getByRole('button', { name: 'Focus mode' }).click();
    const drawer = page.locator('[data-drawer]').first();
    if ((await drawer.getAttribute('data-drawer')) !== 'open') {
      await page.getByRole('button', { name: 'Controls' }).click();
    }
    await expect(drawer).toHaveAttribute('data-drawer', 'open');

    // The drawer scrolls, and Tiling sits well below its fold.
    const repeat = page.getByRole('radio', { name: 'Repeat' });
    await repeat.scrollIntoViewIfNeeded();
    await repeat.click();
    const count = page.getByRole('radio', { name: '3 by 3' });
    await count.scrollIntoViewIfNeeded();
    await count.click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('img', { name: /Repeat preview, 3 columns by 3 rows/ })).toBeVisible();
    expect(await backgroundColumns(page)).toBeLessThanOrEqual(2);
  });

  test('reads the same cell from any copy, and keeps it through a change of count', async ({ page }) => {
    await openAndRun(page);
    await page.getByRole('radio', { name: 'Repeat' }).click();
    await page.getByRole('radio', { name: '2 by 2' }).click();
    await page.waitForTimeout(300);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the canvas has no size');

    // The artwork is a centred square within the canvas; a quarter and three
    // quarters across it are the same place in the top-left and top-right copy.
    const size = Math.min(box.width, box.height);
    const left = box.width / 2 - size / 2;
    const top = box.height / 2 - size / 2;

    await canvas.click({ position: { x: left + size * 0.15, y: top + size * 0.15 } });
    const first = await page
      .locator('[role="status"]')
      .filter({ hasText: /Row \d+, column/ })
      .innerText();

    await canvas.click({ position: { x: left + size * 0.65, y: top + size * 0.15 } });
    const second = await page
      .locator('[role="status"]')
      .filter({ hasText: /Row \d+, column/ })
      .innerText();

    const cell = (text: string) => (/Row \d+, column \d+/u.exec(text) ?? [''])[0];
    expect(cell(second)).toBe(cell(first));
    expect(cell(first)).toMatch(/Row \d+, column \d+/u);
  });

  test('carries the repeat through a shared link', async ({ page, context, browserName }) => {
    // Granting clipboard access is a Chromium capability; WebKit rejects the
    // permission name outright, so the copy step cannot be driven there. The
    // round trip itself is covered without a browser in the integration tests.
    test.skip(browserName === 'webkit', 'WebKit does not support clipboard permissions.');
    await openAndRun(page);
    await page.getByRole('radio', { name: 'Repeat' }).click();
    await page.getByRole('radio', { name: '5 by 5' }).click();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByText(/copied|clipboard/i).first()).toBeVisible({ timeout: 10_000 });

    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#/art/');

    const opened = await context.newPage();
    await stubTryApl(opened);
    await opened.goto(link);
    await expect(opened.getByText(/shared with you/)).toBeVisible({ timeout: 15_000 });

    // Restored as a repeat, and not into Focus mode.
    await expect(opened.getByRole('radio', { name: 'Repeat' })).toHaveAttribute('aria-checked', 'true');
    await expect(opened.getByRole('radio', { name: '5 by 5' })).toHaveAttribute('aria-checked', 'true');
    await expect(opened.getByRole('button', { name: 'Focus mode' })).toBeVisible();
  });
});
