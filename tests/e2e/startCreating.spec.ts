/**
 * Start creating, in a real browser.
 *
 * What only a browser can answer: that the press leads somewhere and draws
 * something, that reloading, Back and Forward show the same artwork rather than a
 * new one, that the seed survives being pasted somewhere else, and that the
 * secondary action moves down this page instead of replacing it. The variation
 * arithmetic is proved against known values in the unit and integration tests.
 */

import { expect, test, type Page } from '@playwright/test';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { stubTryApl } from './stubTryApl';

/** Two fixed seeds, so the determinism checks depend on nothing random. */
const SEED_A = 20_260_805;
const SEED_B = 51_234_567;

const startAction = (page: Page) => page.getByRole('link', { name: 'Start creating' });

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

/**
 * Opens the full technical workspace, wherever this layout keeps it.
 *
 * Three arrangements to cope with: a session hides it behind a disclosure, a
 * narrow screen keeps it in tabs, and an ordinary wide workspace has it open
 * already. Any of them is one press away, which is the point being relied on
 * here rather than asserted — `playWorkspace.spec.ts` is where it is asserted.
 */
async function fullWorkspaceOn(page: Page, tab: 'Code' | 'Controls' = 'Code'): Promise<void> {
  const disclosure = page.getByText('Code and full controls');
  if ((await disclosure.count()) > 0) {
    if (!(await page.locator('.cm-content').isVisible())) await disclosure.click();
    return;
  }

  const tabs = page.getByRole('tab', { name: tab });
  if ((await tabs.count()) > 0) await tabs.click();
}

/**
 * The program on screen, whichever layout is showing it.
 *
 * Read after the artwork rather than before: the narrow layout puts the two in
 * different tabs, so asking for the code first would hide the canvas.
 */
async function sourceOn(page: Page): Promise<string> {
  await page.locator('.cm-content, [role="tab"]').first().waitFor({ state: 'attached' });
  await fullWorkspaceOn(page);

  await page.waitForSelector('.cm-content', { state: 'visible' });
  return page.locator('.cm-content').innerText();
}

/** Reveals the controls panel, wherever this layout keeps it. */
async function controlsOn(page: Page): Promise<void> {
  await fullWorkspaceOn(page, 'Controls');
}

/**
 * Waits for a drawn artwork, in either layout.
 *
 * The canvas is the evidence and it is on the page both ways round; the run
 * status is not — the narrow layout keeps it in the Code tab beside the button it
 * describes. So the picture is what is waited for, and the status is asserted
 * additionally wherever it is showing.
 */
async function waitForArtwork(page: Page) {
  await expect(page.getByRole('img', { name: /grid/ })).toBeVisible({ timeout: 30_000 });

  const status = runStatus(page);
  if ((await status.count()) > 0) await expect(status).not.toHaveText(/Running/);
}

/** The seed the gallery's action is currently offering. */
async function offeredSeed(page: Page): Promise<string> {
  const href = (await startAction(page).getAttribute('href')) ?? '';
  return new URLSearchParams(href.split('?')[1] ?? '').get('play') ?? '';
}

/** How many runs have happened: one first request per run, then bands. */
const runs = (requests: readonly string[]) =>
  requests.filter((request) => request.includes(ADAPTIVE_MARKER)).length;

test.describe('the two ways into the gallery', () => {
  test('offers Start creating as the dominant action, with browsing beside it', async ({ page }) => {
    await page.goto('./');

    const start = startAction(page);
    const browse = page.getByRole('link', { name: 'Browse the gallery' });
    await expect(start).toBeVisible();
    await expect(browse).toBeVisible();

    /*
     * Dominance is measured rather than assumed, and by three signals, because
     * any one of them could be true by accident of the theme: it is filled where
     * the other is not, its type is larger, and it is taller. Width is
     * deliberately not compared — the labels differ in length, so it would be
     * measuring the words instead of the hierarchy.
     */
    const styleOf = (locator: typeof start) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, size: parseFloat(style.fontSize) };
      });

    const filled = await styleOf(start);
    const plain = await styleOf(browse);
    expect(filled.background).not.toBe(plain.background);
    expect(filled.size).toBeGreaterThan(plain.size);

    const startBox = await start.boundingBox();
    const browseBox = await browse.boundingBox();
    expect(startBox?.height ?? 0).toBeGreaterThan(browseBox?.height ?? 0);

    // And it comes first in the reading order, not only in the styling.
    const order = await page
      .getByRole('link', { name: /^(Start creating|Browse the gallery)$/ })
      .allInnerTexts();
    expect(order).toEqual(['Start creating', 'Browse the gallery']);
  });

  test('Browse the gallery moves down this page rather than leaving it', async ({ page }) => {
    await page.goto('./');

    await page.getByRole('link', { name: 'Browse the gallery' }).click();

    // Still the gallery: a bare fragment is an in-page anchor, and the router
    // deliberately does not read one as a route.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiny programs.');
    await expect(startAction(page)).toBeVisible();
    await expect(page.getByRole('link', { name: /^Open Modular Bloom/ })).toBeVisible();

    // And it moved: the page is no longer at the top.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('leaves the ordinary way into an artwork alone', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./');

    await page.getByRole('link', { name: /^Open Modular Bloom/ }).click();

    // The preset's own program, nothing run until asked, and no seed in the
    // address: opening a card is what it always was.
    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();
    await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
    expect(page.url()).not.toContain('play=');
    expect(stub.requests).toHaveLength(0);

    expect(await sourceOn(page)).toContain('size←64');
  });
});

test.describe('a Start creating session', () => {
  test('opens the starter artwork and draws it, unasked and once', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./');

    await startAction(page).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();
    await waitForArtwork(page);

    // Nobody pressed Run, and nothing claims this was sent by somebody else.
    await expect(page.getByText(/shared with you/)).toHaveCount(0);
    expect(runs(stub.requests)).toBe(1);

    // A re-render with nothing to do with the artwork must not start another.
    await controlsOn(page);
    await page.getByRole('checkbox', { name: /Invert palette/ }).click();
    await page.waitForTimeout(300);
    expect(runs(stub.requests)).toBe(1);
  });

  test('opens the artwork its own address describes, and not a new one', async ({ page }) => {
    await stubTryApl(page);

    await page.goto(`./#/art/modular-bloom?play=${String(SEED_A)}`);
    await waitForArtwork(page);
    const first = await sourceOn(page);

    // Reload: the same address, so the same artwork.
    await page.reload();
    await waitForArtwork(page);
    expect(await sourceOn(page)).toBe(first);

    // Away and back by link alone, which is what somebody pasting it does.
    await page.goto('./#/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About APL Art');
    await page.goto(`./#/art/modular-bloom?play=${String(SEED_A)}`);
    await waitForArtwork(page);
    expect(await sourceOn(page)).toBe(first);

    // A different seed is a different artwork, or the seed is not reaching the
    // generator at all.
    await page.goto(`./#/art/modular-bloom?play=${String(SEED_B)}`);
    await waitForArtwork(page);
    expect(await sourceOn(page)).not.toBe(first);
  });

  test('Back returns to the gallery, and Forward to the same artwork', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./');

    const offered = await offeredSeed(page);
    await startAction(page).click();
    await waitForArtwork(page);
    const opened = await sourceOn(page);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiny programs.');

    /*
     * Coming back to the gallery offers something new — the reason to come back —
     * so the seed on the page must have moved on even though the one behind us
     * has not.
     */
    expect(await offeredSeed(page)).not.toBe(offered);

    await page.goForward();
    await waitForArtwork(page);
    expect(await sourceOn(page)).toBe(opened);
  });

  test('is still an ordinary workspace, with the whole artwork in reach', async ({ page }) => {
    // Stage 3 opens the existing workspace on a varied artwork. Nothing about it
    // is a reduced view: the code is editable and Run is where it always was.
    await stubTryApl(page);
    await page.goto(`./#/art/modular-bloom?play=${String(SEED_A)}`);
    await waitForArtwork(page);

    // The code first: on a narrow screen the editor and Run share a tab with
    // each other rather than with the artwork.
    expect(await sourceOn(page)).toContain('modulus|multiplier×∘.×⍨⍳size');
    await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
  });
});
