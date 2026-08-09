/**
 * Dragging a region out of the artwork, in a real browser.
 *
 * jsdom cannot lay a canvas out, so the integration tests have to be told where
 * the canvas is. Here it really is somewhere, the pointer really moves across
 * it, and the letterboxing is whatever the layout made it — which is the part
 * that no amount of unit testing can vouch for.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { editorLocator, pressRun } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

function runStatus(page: Page) {
  return page.locator('[role="status"][data-status]');
}

async function openMandelbrot(page: Page) {
  await stubTryApl(page);
  await page.goto('./#/art/mandelbrot-field');
  await expect(page.getByRole('heading', { level: 1, name: 'Mandelbrot Field' })).toBeVisible();
}

async function runAndWait(page: Page) {
  await pressRun(page);
  await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
}

async function settledSignature(page: Page): Promise<string> {
  const read = () =>
    page.evaluate(() => {
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

  let previous = await read();
  let repeats = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await read();
    repeats = current === previous ? repeats + 1 : 0;
    previous = current;
    if (repeats >= 2) return current;
  }
  return previous;
}

/**
 * The editor's text, which is where the truth about the view lives.
 *
 * Read without navigating. CodeMirror stays mounted behind the other tabs, so
 * textContent answers from any mode — and that matters here: several of these
 * tests are about Focus mode, where reaching the editor means opening the
 * drawer, and a reading that changed the state being asserted would be no
 * reading at all. innerText would need the panel on screen, and the assertions
 * are all substrings, so the line breaks it adds are not wanted either.
 */
async function code(page: Page): Promise<string> {
  // The non-breaking spaces CodeMirror renders, normalised to ordinary ones.
  return (await editorLocator(page).textContent())?.replaceAll(' ', ' ') ?? '';
}

/**
 * The view as the code now states it.
 *
 * Read back as numbers rather than matched as strings, because a drag is only
 * ever as accurate as the pointer position the browser reported. Coordinates
 * arrive rounded, and the rounding differs between engines, so a gesture that
 * was symmetric about the middle of the canvas lands about a pixel off — some
 * 0.003 of the plane at the starting span. The assertions allow for that; the
 * mistakes worth catching, such as ignoring the letterbox, are wrong by a
 * hundred times as much.
 */
async function viewFromCode(page: Page): Promise<{ centreX: number; centreY: number; span: number }> {
  const text = await code(page);
  const number = (variable: string): number => {
    const match = new RegExp(`${variable}←(¯?[\\d.]+)`, 'u').exec(text);
    if (match === null) throw new Error(`${variable} is not assigned a plain number`);
    return Number((match[1] as string).replace('¯', '-'));
  };
  return { centreX: number('centreX'), centreY: number('centreY'), span: number('zoom') };
}

/** A pixel or two of the plane, at the preset's starting span. */
const PIXEL_TOLERANCE = 0.01;

/** Drags between two points given as fractions of the canvas box. */
async function dragRegion(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('the canvas is not on screen');

  const at = ([u, v]: readonly [number, number]) => ({
    x: box.x + box.width * u,
    y: box.y + box.height * v,
  });

  const start = at(from);
  const end = at(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // More than one move, so the overlay is genuinely tracking rather than
  // jumping straight to the release point.
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

test.describe('exploring the Mandelbrot set', () => {
  test.use({ viewport: WIDE });

  test('a drag rewrites the visible APL and redraws from it', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    expect(await code(page)).toContain('zoom←1.4');
    const before = await settledSignature(page);

    await dragRegion(page, [0.35, 0.35], [0.55, 0.55]);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    /*
     * The claim the whole application rests on. The artwork did not move a
     * camera the code knows nothing about — the code changed, and the picture
     * followed from running it.
     */
    const after = await code(page);
    expect(after).not.toContain('zoom←1.4');
    expect(after).toMatch(/zoom←0\.\d+/u);
    expect(after).toMatch(/centreX←¯?\d+\.\d+/u);

    expect(await settledSignature(page)).not.toBe(before);
  });

  test('the span narrows in proportion to the region dragged', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    // A quarter of the width, so a quarter of the span, whatever the
    // letterboxing turned out to be.
    await dragRegion(page, [0.375, 0.375], [0.625, 0.625]);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    expect((await viewFromCode(page)).span).toBeCloseTo(1.4 * 0.25, 2);
  });

  test('a drag on the middle leaves the centre where it was', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    await dragRegion(page, [0.3, 0.3], [0.7, 0.7]);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    // Symmetric about the middle, so only the span should have moved. This is
    // the assertion that fails if the letterbox offset is handled wrongly: on a
    // wide window the mat either side is a fifth of the canvas, so ignoring it
    // would move the centre by about half a plane unit.
    const view = await viewFromCode(page);
    expect(view.centreX).toBeGreaterThan(-0.6 - PIXEL_TOLERANCE);
    expect(view.centreX).toBeLessThan(-0.6 + PIXEL_TOLERANCE);
    expect(Math.abs(view.centreY)).toBeLessThan(PIXEL_TOLERANCE);
    expect(view.span).toBeCloseTo(1.4 * 0.4, 2);
  });

  test('Back returns to the view that was left', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);
    const original = await settledSignature(page);

    await dragRegion(page, [0.35, 0.35], [0.6, 0.6]);
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    expect(await code(page)).not.toContain('zoom←1.4');

    await page.getByRole('button', { name: /^Back/ }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    expect(await code(page)).toContain('zoom←1.4');
    expect(await settledSignature(page)).toBe(original);
  });

  test('a press without a drag reads a value instead of moving the view', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    const box = await page.locator('canvas').boundingBox();
    if (box === null) throw new Error('the canvas is not on screen');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    /*
     * This used to assert the canvas was byte-identical afterwards, on the
     * grounds that a press did nothing at all. It does something now — it marks
     * the cell it read — so the canvas legitimately changes. What still has to
     * hold is that the *view* did not: the code is untouched and nothing ran.
     */
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toBeVisible();
    expect(await code(page)).toContain('zoom←1.4');
    await expect(runStatus(page)).not.toHaveText(/Running/);
  });

  test('Escape abandons a drag in progress without leaving Focus mode', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();

    const box = await page.locator('canvas').boundingBox();
    if (box === null) throw new Error('the canvas is not on screen');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);

    await page.keyboard.press('Escape');
    await page.mouse.up();

    // The innermost thing Escape can mean here is the drag.
    expect(await code(page)).toContain('zoom←1.4');
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  });

  test('an artwork that is not a plane offers no view controls', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveCount(0);
    await expect(page.getByText(/Drag a region/)).toHaveCount(0);
  });
});

test.describe('reading a value off the artwork', () => {
  test.use({ viewport: WIDE });

  /** Presses a point given as fractions of the canvas box. */
  async function pressAt(page: Page, u: number, v: number) {
    const box = await page.locator('canvas').boundingBox();
    if (box === null) throw new Error('the canvas is not on screen');
    await page.mouse.click(box.x + box.width * u, box.y + box.height * v);
  }

  test('names a cell, and lets go of it', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    await pressAt(page, 0.5, 0.5);
    // The middle of a 128-wide view, so around the middle of the matrix.
    await expect(page.getByText(/^Row 6[0-9], column 6[0-9]$/u)).toBeVisible();

    // `exact`, because the inspector controls also offer "Clear selection".
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toHaveCount(0);
  });

  test('ignores a press on the mat beside the artwork', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);

    /*
     * In Focus mode, where the mat actually exists. The workspace panel is
     * square and so is this artwork, so there is no letterbox to press on there
     * — an earlier version of this test pressed the far left of the workspace
     * canvas and got column 3, correctly.
     */
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.waitForTimeout(500);

    // A fifth of the canvas either side is bare background at this window size.
    await pressAt(page, 0.02, 0.5);
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toHaveCount(0);

    // The middle of the same canvas is on the artwork, so the press works there.
    await pressAt(page, 0.5, 0.5);
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toBeVisible();
  });

  test('works in Focus mode, where the artwork is letterboxed differently', async ({ page }) => {
    await openMandelbrot(page);
    await runAndWait(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.waitForTimeout(500);

    await pressAt(page, 0.5, 0.5);
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toBeVisible();

    // Escape puts the reading away before it means anything else, so Focus mode
    // is still on afterwards.
    await page.keyboard.press('Escape');
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  });

  test('reports a tile class on an artwork made of motifs', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/truchet-grid');
    await expect(page.getByRole('heading', { level: 1, name: 'Truchet Grid' })).toBeVisible();
    await runAndWait(page);

    // Each tile is many pixels; the answer has to be the logical cell.
    await pressAt(page, 0.5, 0.5);
    await expect(page.getByText(/^Row \d+, column \d+$/u)).toBeVisible();
    // The panel says everything twice — once to be seen, once to be heard — so
    // this asks the announced sentence rather than matching both.
    await expect(page.locator('[role="status"]').filter({ hasText: /cells share it/u })).toHaveCount(1);
  });
});

test.describe('exploring on a phone', () => {
  test.use({ viewport: PHONE });

  test('a drag on the artwork tab zooms in', async ({ page }) => {
    await openMandelbrot(page);
    await page.getByRole('tab', { name: 'Code' }).click();
    await runAndWait(page);
    await page.getByRole('tab', { name: 'Artwork' }).click();

    await dragRegion(page, [0.35, 0.35], [0.6, 0.6]);

    // The run status lives with the Run controls, which are on the Code tab, so
    // there is nothing to wait on until we are back there.
    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    expect(await code(page)).not.toContain('zoom←1.4');
  });
});

test.describe('the navigation cluster on the artwork', () => {
  test('collapses out of sight, and comes back', async ({ page }) => {
    await openMandelbrot(page);

    /*
     * The narrow layout keeps the editor and its Run button in a tab, and the
     * artwork — with the cluster on it — in another. So the run is asked for
     * where the button is, and the artwork is returned to before anything on it
     * is looked at.
     */
    const codeTab = page.getByRole('tab', { name: 'Code' });
    if ((await codeTab.count()) > 0) await codeTab.click();
    await runAndWait(page);

    const artworkTab = page.getByRole('tab', { name: 'Artwork' });
    if ((await artworkTab.count()) > 0) await artworkTab.click();

    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    await expect(zoomIn).toBeVisible();

    /*
     * Asserted in a browser because only a browser applies the stylesheet. The
     * `hidden` attribute is what takes these out of the accessibility tree, but a
     * class setting `display` outranks it — so collapsing once left every button
     * on screen while a test asking by role was told they had gone. What is
     * checked here is the picture, not the tree.
     */
    await page.getByRole('button', { name: 'Hide navigation' }).click();
    await expect(zoomIn).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pan up' })).toBeHidden();

    // The artwork is unobstructed, and the way back is a single press.
    const toggle = page.getByRole('button', { name: 'Show navigation' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(zoomIn).toBeVisible();
  });
});
