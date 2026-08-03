/**
 * The APL is in the bundle, not on the network.
 *
 * The artwork programs live in `.apl` files, which is a build-time arrangement
 * only: Vite inlines each one as a string. Only a browser against a real
 * production build can show that nothing turned into a runtime request — and if
 * it ever did, the editor would be empty on a slow connection and completely
 * broken on a failed one, for a file the visitor has no reason to know exists.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

/**
 * The narrow layout puts the editor behind a tab; the wide one shows it.
 *
 * Located by CodeMirror's own class, as the rest of the suite does, because
 * WebKit does not expose its contenteditable as a textbox.
 */
async function editorOn(page: Page) {
  // Wait for whichever the layout offers before asking which it was, or the
  // check races the first render and decides there are no tabs.
  await page.locator('.cm-content, [role="tab"]').first().waitFor();

  const tab = page.getByRole('tab', { name: 'Code' });
  if ((await tab.count()) > 0) await tab.click();

  await page.waitForSelector('.cm-content');
  return page.locator('.cm-content');
}

test.describe('artwork source in a production build', () => {
  test('is served with the page rather than fetched', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await stubTryApl(page);
    await page.goto('./#/art/mandelbrot-field');

    // Present before anything could have been fetched for it.
    const editor = await editorOn(page);
    await expect(editor).toContainText('step←{(zr zi a n)←⍵');
    await expect(editor).toContainText('iterations←48');

    // Visit a second artwork too: a per-artwork fetch would only show up on
    // whichever one was not part of the first chunk.
    await page.goto('./#/art/truchet-grid');
    await expect(await editorOn(page)).toContainText('classes←2');

    expect(requested.filter((url) => url.includes('.apl'))).toEqual([]);
  });

  test('is the file’s program, glyph for glyph', async ({ page, browserName, context }) => {
    // Clipboard permissions are a Chromium capability; the assertion is about
    // the bundled string, which is not browser-specific.
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    /*
     * Taken from Copy APL rather than read off the screen. The editor renders
     * a blank line as its own element, so reading the DOM answers a question
     * about CodeMirror; the clipboard is the editor's own document, and it is
     * also the exact text a visitor would paste into an interpreter.
     */
    await page.getByRole('button', { name: 'Copy APL' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());

    const { readFile } = await import('node:fs/promises');
    const file = await readFile(new URL('../../src/presets/apl/modular-bloom.apl', import.meta.url), 'utf8');

    /*
     * The file's one trailing newline is the file convention; everything else
     * must survive the journey from disk to bundle to editor to clipboard.
     * Both sides are normalised to LF because the Windows clipboard hands back
     * CRLF regardless of what was written to it.
     */
    const lf = (text: string) => text.replace(/\r\n/gu, '\n');
    expect(lf(copied)).toBe(lf(file).replace(/\n$/u, ''));
  });
});
