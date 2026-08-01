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

/**
 * A signature of what is actually painted, for before-and-after checks.
 *
 * Hashes the whole image rather than a prefix of it. On a high-density
 * viewport the backing store is large and the first few thousand base64
 * characters are all background, so two visibly different artworks can share
 * them.
 */
async function canvasSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return 'no-canvas';
    const data = canvas.toDataURL();
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) {
      hash ^= data.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${data.length}:${hash.toString(16)}`;
  });
}

/**
 * The signature, once the canvas has stopped changing.
 *
 * The canvas is painted by an effect and repainted by a ResizeObserver, so a
 * read taken the instant a run finishes can catch it mid-settle. Any later
 * comparison against that value then fails for the wrong reason. Waiting for
 * two identical consecutive reads makes the baseline trustworthy.
 */
async function settledCanvasSignature(page: Page): Promise<string> {
  let previous = await canvasSignature(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await canvasSignature(page);
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

/** Replaces the editor's contents. fill() drives contenteditable reliably; a
 *  select-all keystroke does not on every browser. */
async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').fill(code);
}

/*
 * These journeys exercise the two-column layout, so they pin a wide viewport.
 * Without it the mobile-safari project would run them at phone width, where the
 * editor and Run control sit behind a tab. Narrow behaviour has its own group
 * at the bottom of this file.
 */
const WIDE = { width: 1440, height: 950 };

test.describe('the artwork journey', () => {
  test.use({ viewport: WIDE });

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
    const before = await settledCanvasSignature(page);

    await expect(page.locator('.cm-content')).toContainText('modulus←17');

    await page.getByLabel('Modulus').fill('12');

    // The editor shows the change, which is the whole point of the control.
    await expect(page.locator('.cm-content')).toContainText('modulus←12');
    await runAndWait(page);

    expect(stub.requests.at(-1)).toContain('modulus←12');

    // Polled, not asserted once: the status reaches "Finished" when the state
    // updates, but the canvas is repainted by an effect after that, so reading
    // it immediately is a race.
    await expect.poll(() => canvasSignature(page), { message: 'the artwork never changed' }).not.toBe(before);
  });

  test('runs from the keyboard with the shortcut', async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'Emulated mobile Safari does not deliver the modifier chord to the editor.');

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
    const before = await settledCanvasSignature(page);

    await page.getByRole('radio', { name: /Poolrooms/ }).click();

    await expect(page.getByRole('img', { name: /Poolrooms palette/ })).toBeVisible();
    await expect
      .poll(() => canvasSignature(page), { message: 'the artwork never recoloured' })
      .not.toBe(before);
    expect(stub.requests).toHaveLength(requestsAfterRun);
  });

  test('invalid APL shows an error and keeps the previous artwork', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await runAndWait(page);
    const drawn = await settledCanvasSignature(page);

    // Remove the size assignment so the expression cannot resolve.
    await setCode(page, 'modulus←9\nmodulus|1');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    // The artwork survives the failure untouched.
    expect(await canvasSignature(page)).toBe(drawn);
  });

  // Resetting is covered in full by "reset artwork asks first and then
  // restores everything", which also exercises the confirmation step.

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
  test.use({ viewport: WIDE });

  test('a share link restores the code and appearance', async ({ page, context, browserName }) => {
    // Granting clipboard access is a Chromium capability; WebKit rejects the
    // permission name outright, so the copy step cannot be driven there.
    test.skip(browserName === 'webkit', 'WebKit does not support clipboard permissions.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stubTryApl(page);
    await openModularBloom(page);

    await setCode(page, 'size←24\nmodulus←5\nmultiplier←3\nmodulus|multiplier×∘.×⍨⍳size');
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
  test.use({ viewport: WIDE });

  test('the whole journey works from the keyboard alone', async ({ page, isMobile }) => {
    // iOS Safari does not move focus to links with Tab unless the user has
    // turned that on. That is a platform preference, not something this
    // application controls.
    test.skip(isMobile === true, 'iOS Safari does not tab to links by default.');

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

test.describe('editing aids', () => {
  test.use({ viewport: WIDE });

  test('the symbol toolbar inserts at the cursor and keeps focus in the editor', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await setCode(page, 'size←4');
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');

    await page.getByRole('button', { name: /Insert Index generator/ }).click();
    await expect(page.locator('.cm-content')).toContainText('size←4⍳');

    // Focus must come back, or a run of glyphs cannot be tapped out.
    await expect(page.locator('.cm-content')).toBeFocused();

    await page.getByRole('button', { name: /Insert Reshape/ }).click();
    await expect(page.locator('.cm-content')).toContainText('size←4⍳⍴');
  });

  test('every symbol button has a name a screen reader can read', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    const buttons = page.getByRole('toolbar', { name: 'APL symbols' }).getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(40);

    for (let index = 0; index < count; index += 1) {
      const label = await buttons.nth(index).getAttribute('aria-label');
      // "Insert Index generator, ⍳" rather than just the glyph.
      expect(label, `button ${index}`).toMatch(/^Insert .+, .+$/u);
    }
  });

  test('randomise changes the parameters and the code together', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    const before = await page.locator('.cm-content').innerText();
    await page.getByRole('button', { name: 'Randomise' }).click();

    await expect(page.locator('.cm-content')).not.toHaveText(before);
    await expect(page.getByText('Edited')).toBeVisible();
    await runAndWait(page);
    await expect(page.getByRole('img', { name: /grid/ })).toBeVisible();
  });

  test('reset parameters restores the defaults but keeps other edits', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    // A hand-written comment stands in for work the user does not want lost.
    await setCode(page, '⍝ mine\nsize←16\nmodulus←3\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size');
    await page.getByRole('button', { name: 'Reset parameters' }).click();

    await expect(page.locator('.cm-content')).toContainText('size←64');
    await expect(page.locator('.cm-content')).toContainText('modulus←17');
    await expect(page.locator('.cm-content')).toContainText('⍝ mine');
  });

  test('reset artwork asks first and then restores everything', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await setCode(page, 'size←8');
    await page.getByRole('radio', { name: /Neon/ }).click();

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Backing out must change nothing.
    await page.getByRole('button', { name: 'Keep my changes' }).click();
    await expect(page.locator('.cm-content')).toContainText('size←8');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Reset everything' }).click();

    await expect(page.locator('.cm-content')).toContainText('modulus←17');
    await expect(page.getByRole('radio', { name: /Dyalog/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Original', { exact: true })).toBeVisible();
  });

  test('lists the primitives used, with an explanation for each', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    const panel = page.getByRole('region', { name: 'APL used in this piece' });
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: /Residue/ }).click();
    await expect(panel.getByText('The remainder after dividing.')).toBeVisible();
  });
});

test.describe('remembering work between visits', () => {
  test.use({ viewport: WIDE });

  test('reopening an artwork restores the code and palette', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);

    await setCode(page, 'size←24\nmodulus←5\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size');
    await page.getByRole('radio', { name: /Forest/ }).click();
    await runAndWait(page);

    // Leave, and come back the way a returning visitor would.
    await page.goto('./');
    await page.reload();
    await page.getByRole('link', { name: /^Open Modular Bloom/ }).click();

    await expect(page.locator('.cm-content')).toContainText('modulus←5');
    await expect(page.getByRole('radio', { name: /Forest/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('clearing local data puts the artwork back to its original', async ({ page }) => {
    await stubTryApl(page);
    await openModularBloom(page);
    await setCode(page, 'size←24\nmodulus←5\nmultiplier←1\nmodulus|multiplier×∘.×⍨⍳size');
    await expect(page.getByText('Edited')).toBeVisible();

    await page.goto('./#/help');
    await page.getByRole('button', { name: 'Clear local data' }).click();
    await page.getByRole('button', { name: 'Clear everything' }).click();
    await expect(page.getByText('Everything saved in this browser has been removed.')).toBeVisible();

    await page.goto('./#/art/modular-bloom');
    await expect(page.locator('.cm-content')).toContainText('modulus←17');
  });
});
