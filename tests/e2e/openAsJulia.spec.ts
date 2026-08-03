/**
 * Opening a Julia set from a point on the Mandelbrot set, in a real browser.
 *
 * Three things only a browser can answer: that Back returns to the Mandelbrot
 * artwork untouched, that Forward comes back to the handed-off Julia, and that
 * moving the pointer over the artwork never asks the service for anything. The
 * coordinate arithmetic is proved against known values in the integration tests.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

const editor = (page: Page) => page.locator('.cm-content');

async function runMandelbrot(page: Page) {
  await page.goto('./#/art/mandelbrot-field');
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

/** Selects a point inside the set, so the Julia set it names is a connected one. */
async function selectPoint(page: Page) {
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 700, y: 470 } });
  await expect(page.getByRole('button', { name: 'Open as Julia set' })).toBeVisible();
}

test.describe('Open as Julia set', () => {
  test.use({ viewport: WIDE });

  test('hands the point over, and Back and Forward both behave', async ({ page }) => {
    const stub = await stubTryApl(page);
    await runMandelbrot(page);
    await selectPoint(page);

    const mandelbrotSource = await editor(page).innerText();
    const afterMandelbrot = stub.requests.length;

    await page.getByRole('button', { name: 'Open as Julia set' }).click();

    // Julia, on the chosen constant, run once without being asked twice.
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    await expect(editor(page)).toContainText('realC←');
    await expect(page.getByText('Edited')).toBeVisible();

    const juliaSource = await editor(page).innerText();
    const constant = /realC←(¯?[\d.]+)[\s\S]*?imagC←(¯?[\d.]+)/u.exec(juliaSource);
    expect(constant, 'the handed-over constant').not.toBeNull();

    // Julia's own view, not the plane the constant was picked from.
    expect(juliaSource).toContain('zoom←1.3');
    expect(juliaSource).toContain('centreX←0');
    expect(stub.requests.length).toBeGreaterThan(afterMandelbrot);
    const afterJulia = stub.requests.length;

    /*
     * Back. The Mandelbrot artwork must be exactly as it was left — the handoff
     * navigated away from it and never wrote to it.
     */
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
    await expect(editor(page)).toContainText('centreX←¯0.6');
    expect(await editor(page).innerText()).toBe(mandelbrotSource);

    // Forward. The same Julia, from the payload the tab still holds.
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();
    await expect(editor(page)).toContainText(`realC←${constant?.[1] ?? ''}`);
    await expect(editor(page)).toContainText(`imagC←${constant?.[2] ?? ''}`);

    // A reload lands in the same place, for the same reason.
    await page.reload();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    await expect(editor(page)).toContainText(`realC←${constant?.[1] ?? ''}`);

    expect(stub.requests.length).toBeGreaterThan(afterJulia);
  });

  test('never carries the token into a shared link', async ({ page, context, browserName }) => {
    // Clipboard permissions are a Chromium capability, and what is asserted here
    // is the shape of a URL rather than anything browser-specific.
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stubTryApl(page);
    await runMandelbrot(page);
    await selectPoint(page);
    await page.getByRole('button', { name: 'Open as Julia set' }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Share' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());

    // The ordinary share representation. The handoff token means nothing outside
    // this tab, so a link carrying it would be a link to plain Julia at best.
    expect(copied).toContain('#/art/julia-set?s=');
    expect(copied).not.toContain('h=');
  });

  test('does nothing on pointer movement', async ({ page }) => {
    const stub = await stubTryApl(page);
    await runMandelbrot(page);

    const before = stub.requests.length;
    const canvas = page.locator('canvas').first();

    // Across the artwork without pressing. A preview on hover would be a run
    // nobody asked for, on a service shared with everybody else.
    // Offsets well inside the element: a position past its width is not a hover
    // over the artwork, it is a locator that never resolves.
    for (const x of [80, 200, 320, 440]) {
      await canvas.hover({ position: { x, y: 200 } });
    }
    await page.waitForTimeout(400);

    expect(stub.requests.length).toBe(before);
    expect(await page.getByRole('button', { name: 'Open as Julia set' }).count()).toBe(0);
  });
});
