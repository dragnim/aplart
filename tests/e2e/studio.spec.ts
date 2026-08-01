import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

/** The status region belonging to the Run controls, not the toolbar's notice. */
function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openModularBloom(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: /^Open/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();
}

async function runAndWait(page: Page) {
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 20_000 });
}

/** A stable signature of what is actually painted, for before-and-after checks. */
async function canvasSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 'no-canvas';
    return canvas.toDataURL().slice(0, 3000);
  });
}

test.describe('the artwork journey', () => {
  test('opens a preset from the gallery and draws it', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
    await runAndWait(page);

    await expect(runStatus(page)).toHaveText(/Finished in/);
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();
  });

  test('a parameter change rewrites the code and changes the artwork', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);
    const before = await canvasSignature(page);

    await expect(page.locator('.cm-content')).toContainText('modulus←17');

    const modulus = page.getByLabel('Modulus');
    await modulus.focus();
    for (let press = 0; press < 5; press += 1) await page.keyboard.press('ArrowLeft');

    // The editor shows the change, which is the whole point of the control.
    await expect(page.locator('.cm-content')).toContainText('modulus←12');
    await runAndWait(page);

    expect(stub.requests.at(-1)).toContain('modulus←12');
    expect(await canvasSignature(page)).not.toBe(before);
  });

  test('runs from the keyboard with the shortcut', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(runStatus(page)).toHaveText(/Finished in/, { timeout: 20_000 });
  });

  test('changing the palette recolours without another request', async ({ page }) => {
    const stub = await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);

    const requestsAfterRun = stub.requests.length;
    const before = await canvasSignature(page);

    await page.getByRole('radio', { name: /Poolrooms/ }).click();

    await expect(page.getByRole('img', { name: /Poolrooms palette/ })).toBeVisible();
    expect(await canvasSignature(page)).not.toBe(before);
    expect(stub.requests).toHaveLength(requestsAfterRun);
  });

  test('invalid APL shows an error and keeps the previous artwork', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);
    const drawn = await canvasSignature(page);

    // Remove the size assignment so the expression cannot resolve.
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('modulus←9\nmodulus|1');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    // The artwork survives the failure untouched.
    expect(await canvasSignature(page)).toBe(drawn);
  });

  test('resets to the original code', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('size←8');
    await expect(page.getByText('Edited')).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.locator('.cm-content')).toContainText('modulus←17');
    await expect(page.getByText('Original')).toBeVisible();
  });

  test('reports a server failure without losing the code', async ({ page }) => {
    await stubTryApl(page, { failure: 'server' });
    await openModularBloom(page);

    await page.getByRole('button', { name: /^Run/ }).click();

    await expect(page.getByRole('alert')).toContainText('The APL service did not respond');
    await expect(page.locator('.cm-content')).toContainText('modulus←17');
  });

  test('shows a stop control while a run is in flight', async ({ page }) => {
    await stubTryApl(page, { delayMs: 3000 });
    await openModularBloom(page);

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(runStatus(page)).toHaveText(/Running/);

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(runStatus(page)).toHaveText(/Stopped/);
  });
});

test.describe('sharing and export', () => {
  test('a share link restores the code and appearance', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stubTryApl(page);
    await openModularBloom(page);

    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('size←24\nmodulus←5\nmultiplier←3\nmodulus|multiplier×∘.×⍨⍳size');
    await page.getByRole('radio', { name: /Neon/ }).click();

    await page.getByRole('button', { name: 'Share' }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#/art/modular-bloom?s=');

    // Open the link as a stranger would.
    await page.goto(link);
    await expect(page.getByText(/shared with you/)).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('modulus←5');
    await expect(page.getByRole('radio', { name: /Neon/ })).toHaveAttribute('aria-checked', 'true');

    // Shared code is never run until the visitor asks.
    await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
    await runAndWait(page);
    await expect(page.getByRole('img', { name: /24 by 24 grid/ })).toBeVisible();
  });

  test('exports a PNG of the requested size', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: '512 × 512' }).click();

    const file = await download;
    expect(file.suggestedFilename()).toBe('apl-art-modular-bloom-512px.png');
  });
});

test.describe('keyboard and screen reader use', () => {
  test('the whole journey works from the keyboard alone', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./');

    // Skip link, then into the page.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

    // Reach the first Open link without using the mouse.
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (focused.startsWith('Open')) break;
    }
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();
    await runAndWait(page);
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();
  });

  test('the canvas carries a description of the artwork', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);

    // Dimensions and value range, not an attempt to narrate the picture.
    await expect(page.getByRole('img')).toHaveAccessibleName(
      /A 64 by 64 grid with .* ranging from 0 to 16, drawn with the Dyalog palette\./,
    );
  });
});

test.describe('narrow viewports', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the artwork first, with the code behind a tab', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await expect(page.getByRole('tab', { name: 'Artwork' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-content')).toBeHidden();

    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await runAndWait(page);

    await page.getByRole('tab', { name: 'Artwork' }).click();
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();
  });

  test('mounts only one editor, so ids are not duplicated', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await page.getByRole('tab', { name: 'Code' }).click();

    await expect(page.locator('.cm-editor')).toHaveCount(1);
  });
});
