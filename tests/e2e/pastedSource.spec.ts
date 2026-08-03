/**
 * Pasting one artwork's program into another, for real.
 *
 * This began as a reproduction: only a browser can do the actual paste —
 * CodeMirror is a contenteditable and ignores synthetic events — so this is
 * where the problem was demonstrated as a visitor met it. Select all, paste
 * Julia's program into Modular Bloom, press Run, and be told the artwork was too
 * tall and that the remedy was to mark the preset as high resolution.
 *
 * It is now the proof that a pasted program runs, inverted rather than deleted so
 * that the fault cannot return unnoticed. The claim under test is the one the
 * application rests on: what a piece of APL does is decided by the APL, not by
 * which gallery entry happens to be open.
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

/** Pastes the program into whichever artwork is open, and runs it. */
async function pasteAndRun(page: Page) {
  await page.locator('.cm-content').fill(JULIA);
  await expect(page.locator('.cm-content')).toContainText('realC←¯0.8');
  await page.getByRole('button', { name: /^Run/ }).click();
  await expect(runStatus(page).first()).not.toHaveText(/Running/, { timeout: 30_000 });
}

test.describe('a pasted program', () => {
  test.use({ viewport: WIDE });

  test('draws in an artwork that never declared it could be this large', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    await pasteAndRun(page);

    // All 128 rows of somebody else's program, drawn from Modular Bloom.
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);
    await expect(page.getByText(/too tall/)).toHaveCount(0);
    await expect(page.getByText(/high resolution/)).toHaveCount(0);

    // More than one request, because a 128-row result cannot be printed.
    expect(stub.requests.length).toBeGreaterThan(1);

    // The source is untouched: what ran is what is on screen.
    await expect(page.locator('.cm-content')).toContainText('realC←¯0.8');
  });

  test('costs the same as the identical program opened as Julia', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/julia-set');

    await pasteAndRun(page);

    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /128 by 128/);

    /*
     * Recorded rather than compared across tests, which would need shared state
     * between two Playwright workers. The count is asserted against the arithmetic
     * instead: one first request, then a band per slice of 16,384 values, which is
     * a handful and nothing like a request per row.
     */
    expect(stub.requests.length).toBeGreaterThan(1);
    expect(stub.requests.length).toBeLessThan(12);
  });

  test('says the program was run more than once, and only when it was', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');

    // Small: Modular Bloom's own 64×64 result prints, so it is one evaluation.
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(runStatus(page).first()).not.toHaveText(/Running/, { timeout: 30_000 });
    await expect(page.getByText(/run several times/)).toHaveCount(0);

    // Large: the pasted program is assembled from several, and says so once.
    await pasteAndRun(page);
    await expect(page.getByText(/run several times/)).toHaveCount(1);
  });
});
