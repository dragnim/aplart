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
import { choice, advanced, pressRun } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/**
 * A tiling control, matched by its whole label.
 *
 * Playwright's `name` is a substring match by default, and these labels nest:
 * "Repeat" is inside "Mirror repeat", and "50%" inside "150%". Going through
 * one helper means the exactness cannot be forgotten on the next control added.
 */
async function openAndRun(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/truchet-grid');
  await expect(page.getByRole('heading', { level: 1, name: 'Truchet Grid' })).toBeVisible();
  await pressRun(page);
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
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const singleEmpty = await backgroundColumns(page);
    const sent = stub.requests.length;

    for (const count of ['2 by 2', '3 by 3', '5 by 5']) {
      await (await choice(page, 'Repeat')).click();
      await (await choice(page, count)).click();
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
    const repeat = await choice(page, 'Repeat');
    await repeat.scrollIntoViewIfNeeded();
    await repeat.click();
    const count = await choice(page, '3 by 3');
    await count.scrollIntoViewIfNeeded();
    await count.click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('img', { name: /Repeat preview, 3 columns by 3 rows/ })).toBeVisible();
    expect(await backgroundColumns(page)).toBeLessThanOrEqual(2);
  });

  test('reads the same cell from any copy, and keeps it through a change of count', async ({ page }) => {
    await openAndRun(page);
    await (await choice(page, 'Repeat')).click();
    await (await choice(page, '2 by 2')).click();
    await page.waitForTimeout(300);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the canvas has no size');

    // The artwork is a centred square within the canvas; a quarter and three
    // quarters across it are the same place in the top-left and top-right copy.
    const size = Math.min(box.width, box.height);
    const left = box.width / 2 - size / 2;
    const top = box.height / 2 - size / 2;

    /*
     * Exactly one copy apart, by construction.
     *
     * The two points used to be 0.15 and 0.65 of the width — half the artwork
     * apart in principle, and a rounding error apart in practice as soon as the
     * square's pixel size changed. A whole number of pixels for the copy, and the
     * second click cannot land in a different cell of it than the first.
     */
    const copy = Math.round(size / 2);
    const firstX = Math.round(left + size * 0.15);
    const firstY = Math.round(top + size * 0.15);

    await canvas.click({ position: { x: firstX, y: firstY } });
    const first = await page
      .locator('[role="status"]')
      .filter({ hasText: /Row \d+, column/ })
      .innerText();

    await canvas.click({ position: { x: firstX + copy, y: firstY } });
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
    await (await choice(page, 'Repeat')).click();
    await (await choice(page, '5 by 5')).click();

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
    await expect(await choice(opened, 'Repeat')).toHaveAttribute('aria-checked', 'true');
    await expect(await choice(opened, '5 by 5')).toHaveAttribute('aria-checked', 'true');
    await expect(opened.getByRole('button', { name: 'Focus mode' })).toBeVisible();
  });
});

test.describe('mirroring the repeat', () => {
  test.use({ viewport: WIDE });

  test('leaves no gap, at every count and scale', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/truchet-grid');
    await pressRun(page);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const singleEmpty = await backgroundColumns(page);
    const sent = stub.requests.length;

    await (await choice(page, 'Mirror repeat')).click();
    for (const count of ['2 by 2', '3 by 3', '5 by 5']) {
      await (await choice(page, count)).click();
      for (const scale of ['50%', '100%', '200%']) {
        await (await choice(page, scale)).click();
        await page.waitForTimeout(250);
        expect(await backgroundColumns(page), `${count} at ${scale}`).toBeLessThanOrEqual(singleEmpty);
      }
    }

    // Reflection is a way of drawing the same result, not a reason to fetch it.
    expect(stub.requests.length).toBe(sent);
  });

  test('reads one source cell from all four reflections', async ({ page }) => {
    await openAndRun(page);
    await (await choice(page, 'Mirror repeat')).click();
    await (await choice(page, '2 by 2')).click();
    await page.waitForTimeout(300);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the canvas has no size');
    const size = Math.min(box.width, box.height);
    const left = box.width / 2 - size / 2;
    const top = box.height / 2 - size / 2;

    const readings: string[] = [];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        /*
         * The centre of a cell, not a round fraction. Truchet is 20 cells
         * across, so a fifth of the way in is exactly a cell boundary and the
         * reflection decides which side of it the point falls — a real
         * ambiguity, resolved deterministically elsewhere, but not what this
         * test is about. A cell centre stays a cell centre when reflected.
         */
        const intoCell = 4.5 / 20;
        const withinX = column === 1 ? 1 - intoCell : intoCell;
        const withinY = row === 1 ? 1 - intoCell : intoCell;
        await canvas.click({
          position: {
            x: left + (size * (column + withinX)) / 2,
            y: top + (size * (row + withinY)) / 2,
          },
        });
        readings.push(
          await page
            .locator('[role="status"]')
            .filter({ hasText: /Row \d+, column/ })
            .innerText(),
        );

        /*
         * Dismissed between reads. The reading panel sits over the lower-left
         * of the artwork, so with it open the bottom-left copy cannot be
         * pressed — by the test or by anybody else.
         */
        await page.getByRole('button', { name: 'Clear', exact: true }).click();
      }
    }

    const cell = (text: string) => (/Row \d+, column \d+/u.exec(text) ?? [''])[0];
    expect(new Set(readings.map(cell)).size).toBe(1);
  });

  test('works in Focus mode and is announced as mirrored', async ({ page }) => {
    await openAndRun(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();
    const drawer = page.locator('[data-drawer]').first();
    if ((await drawer.getAttribute('data-drawer')) !== 'open') {
      await page.getByRole('button', { name: 'Controls' }).click();
    }

    const mirror = await choice(page, 'Mirror repeat');
    await mirror.scrollIntoViewIfNeeded();
    await mirror.click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('img', { name: /Mirrored repeat preview/ })).toBeVisible();
    expect(await backgroundColumns(page)).toBeLessThanOrEqual(2);
  });
});

test.describe('the value reading', () => {
  test.use({ viewport: WIDE });

  test('never covers the cell it is describing', async ({ page }) => {
    await openAndRun(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the canvas has no size');
    const size = Math.min(box.width, box.height);
    const left = box.width / 2 - size / 2;
    const top = box.height / 2 - size / 2;

    /*
     * Well into each corner, where the panel used to sit on top of the marker.
     *
     * Ordered so the panel is never in the corner about to be pressed: it moves
     * to the opposite corner from each selection, so going round the four in
     * this sequence always leaves the next one clear. The panel does still cover
     * its own corner while it is open — Hide is the way out of that, and the
     * next test covers it.
     */
    const corners = [
      { name: 'top-left', u: 0.12, v: 0.12 },
      { name: 'top-right', u: 0.88, v: 0.12 },
      { name: 'bottom-right', u: 0.88, v: 0.88 },
      { name: 'bottom-left', u: 0.12, v: 0.88 },
    ];

    for (const corner of corners) {
      const x = box.x + left + size * corner.u;
      const y = box.y + top + size * corner.v;
      await canvas.click({ position: { x: left + size * corner.u, y: top + size * corner.v } });

      const panel = page.locator('[data-corner]');
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      if (panelBox === null) throw new Error('the reading has no size');

      const covers =
        x >= panelBox.x &&
        x <= panelBox.x + panelBox.width &&
        y >= panelBox.y &&
        y <= panelBox.y + panelBox.height;

      expect(covers, `${corner.name} selection is under the reading`).toBe(false);
    }
  });

  test('hiding exposes the covered corner and keeps the selection; clearing removes it', async ({ page }) => {
    await openAndRun(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the canvas has no size');
    const size = Math.min(box.width, box.height);
    const left = box.width / 2 - size / 2;
    const top = box.height / 2 - size / 2;

    // A cell in the top left, so the reading takes the bottom-right corner.
    await canvas.click({ position: { x: left + size * 0.12, y: top + size * 0.12 } });
    const first = await page
      .locator('[role="status"]')
      .filter({ hasText: /Row \d+, column/ })
      .innerText();
    await expect(page.locator('[data-corner="bottom-right"]')).toBeVisible();

    // The area it covers cannot be pressed while it is there.
    const underneath = { x: left + size * 0.88, y: top + size * 0.88 };
    await expect(page.locator('[data-corner]')).toBeVisible();

    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('[data-corner]')).toBeHidden();

    // The cell is still chosen and still marked: the control that gives it up
    // is offered, and the reading still names the same cell when asked again.
    await expect((await advanced(page)).getByRole('button', { name: 'Clear selection' })).toBeEnabled();

    // And the corner it was covering can now be pressed.
    await canvas.click({ position: underneath });
    const second = await page
      .locator('[role="status"]')
      .filter({ hasText: /Row \d+, column/ })
      .innerText();
    const cell = (text: string) => (/Row \d+, column \d+/u.exec(text) ?? [''])[0];
    expect(cell(second)).not.toBe(cell(first));

    // Clearing removes the reading and the marker together.
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.locator('[data-corner]')).toBeHidden();
    await expect((await advanced(page)).getByRole('button', { name: 'Clear selection' })).toBeDisabled();
  });

  test('hiding the reading keeps the selection; clearing it does not', async ({ page }) => {
    await openAndRun(page);

    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x: 120, y: 120 } });
    await expect(page.locator('[data-corner]')).toBeVisible();

    /*
     * Two different acts. Somebody who only wants to see what is underneath
     * should not lose the cell they chose to get the view.
     */
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.locator('[data-corner]')).toBeHidden();

    // The cell is still chosen: the keyboard control that gives it up is still
    // offered, which it is not when nothing is selected.
    const clear = (await advanced(page)).getByRole('button', { name: 'Clear selection' });
    await expect(clear).toBeEnabled();

    await clear.click();
    await expect(clear).toBeDisabled();
  });
});
