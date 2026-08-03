/**
 * Pasting one artwork's program into another, for real.
 *
 * A reproduction, not a fix. Only a browser can do the actual paste — CodeMirror
 * is a contenteditable and ignores synthetic events — so this is where the
 * problem is demonstrated as a visitor meets it: select all, paste Julia's
 * program into Modular Bloom, press Run, and be told the artwork is too tall and
 * that the remedy is to mark the preset as high resolution.
 *
 * Expected to change when the design does. It is here so the current behaviour
 * is written down rather than described.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };

/** Julia's program, as it would be copied out of the other artwork. */
const JULIA = [
  '⍝ Controls',
  'size←128',
  'iterations←48',
  'realC←¯0.8',
  'imagC←0.156',
  'centreX←0',
  'centreY←0',
  'zoom←1.3',
  '',
  'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
  'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
  'startR←(size,size)⍴ax',
  'startI←⍉(size,size)⍴ay',
  'step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊realC+(zr*2)-zi*2)(¯9⌈9⌊imagC+2×zr×zi)a(n+a)}',
  '⊃⌽step⍣iterations⊢startR startI((size,size)⍴1)(startR×0)',
].join('\n');

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

test.describe('a pasted program', () => {
  test.use({ viewport: WIDE });

  test('is refused by an artwork that does not declare high resolution', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    // Exactly what a visitor does: replace the contents and press Run.
    await page.locator('.cm-content').fill(JULIA);
    await expect(page.locator('.cm-content')).toContainText('realC←¯0.8');
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    /*
     * Refused for a property of the destination artwork rather than of the
     * program, with a remedy addressed to whoever maintains the application.
     */
    await expect(page.getByText(/too tall to fetch in one go/).first()).toBeVisible();
    await expect(page.getByText(/mark the preset as high resolution/).first()).toBeVisible();

    // Said twice: once by the run status and once by the error panel.
    expect(await page.getByText(/too tall to fetch in one go/).count()).toBe(2);

    // The source is untouched, which is the one thing that is right about it.
    await expect(page.locator('.cm-content')).toContainText('realC←¯0.8');
  });

  test('runs when the identical program is opened as Julia', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/julia-set');

    await page.locator('.cm-content').fill(JULIA);
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    // The same text, and no complaint. What differs is the preset it sits in.
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);
    await expect(page.getByText(/too tall/)).toHaveCount(0);
  });
});
