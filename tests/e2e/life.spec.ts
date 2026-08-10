/**
 * The immersive Game of Life, in a real browser.
 *
 * `lifePage.test.tsx` drives the controls and proves the world is not disturbed;
 * jsdom cannot answer the question this file exists for, which is what covers
 * what. The APL panel and the bar are both overlays on the same window, and an
 * opaque panel that lands on top of half the controls leaves every one of them
 * in the document, focusable and named — which is exactly why the fault it
 * carried went unnoticed until somebody looked at a screenshot.
 */

import { expect, test, type Page } from '@playwright/test';

const WIDE = { width: 1440, height: 900 };

/** The world as the canvas describes itself: size, generation and population. */
async function readout(page: Page): Promise<string> {
  return (await page.getByRole('img').first().getAttribute('aria-label')) ?? '';
}

function worldOf(label: string): string {
  return /on a (\d+) by (\d+)/u.exec(label)?.[0] ?? 'unknown';
}

/**
 * Every control of the bar that something else is drawn on top of.
 *
 * Hit-tested rather than measured: a control is reachable when the topmost
 * element at its own centre is the control itself. Comparing rectangles would
 * answer a different and weaker question, because two boxes can overlap while
 * the one underneath is still perfectly pressable.
 */
async function coveredControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('header button, header select, header a')];
    return controls
      .filter((node) => {
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !(node === top || node.contains(top));
      })
      .map((node) =>
        (node.textContent || node.getAttribute('aria-label') || node.tagName).trim().slice(0, 20),
      );
  });
}

async function openLife(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('tryapl')) requests.push(request.url());
  });
  await page.goto('./#/life');
  await expect(aplToggle(page)).toBeVisible();
  return requests;
}

/**
 * Opens the APL panel and waits for it to have finished arriving.
 *
 * The panel travels in from off the right-hand edge, so `data-open="true"` is
 * the beginning of that movement rather than the end of it. Where the panel
 * *is* is settled before the first frame — that is what `opens straight into its
 * final geometry` below asserts — but tests that hit-test the controls still
 * have to let it arrive, because on its way past them it really is over them.
 */
async function openPanel(page: Page) {
  await aplToggle(page).click();
  const panel = page.getByRole('dialog', { name: /APL behind this artwork/u });
  await expect(panel).toHaveAttribute('data-open', 'true');

  /*
   * Arrived, not merely still. Two equal readings in a row can both land before
   * the movement starts, which under load reported a panel that had not moved
   * yet as one that had finished — so this waits for the one position that means
   * fully in: its left edge exactly its own width from the right of the window.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const box = document.getElementById('life-code')?.getBoundingClientRect();
          const bar = document.querySelector('header')?.getBoundingClientRect();
          if (box === undefined || bar === undefined) return -1;
          return Math.round(bar.right - box.x - box.width);
        }),
      { message: 'the panel never finished arriving' },
    )
    .toBe(0);

  return panel;
}

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly barBottom: number;
  readonly barRight: number;
  /** The world underneath, which must be the same in every one of these. */
  readonly world: string;
  /** How far the page has been scrolled, which must always be nowhere. */
  readonly scroll: string;
  readonly open: string | null;
}

/** The toggle, under whichever of its two names it is currently wearing. */
function aplToggle(page: Page) {
  return page.getByRole('button', { name: /^(View|Hide) APL$/u });
}

/**
 * Every frame the panel is drawn in, across one press of the toggle.
 *
 * Sampled with `requestAnimationFrame` from inside the page rather than polled
 * from the test, because the faults being ruled out last a frame or two: a poll
 * from outside can step straight over them and report that all is well.
 *
 * The world is recorded alongside the panel, in the same frame, because the
 * question is not only where the panel went but whether anything else went with
 * it.
 */
async function framesWhileToggling(page: Page, becoming: 'true' | 'closed'): Promise<Frame[]> {
  /*
   * The sampler stops when it has seen enough frames in the new state, not when
   * a clock runs out. On a loaded machine an emulated mobile browser throttles
   * `requestAnimationFrame` hard, and a fixed window either ended before the
   * press was delivered or caught two frames of it — which failed as "nothing
   * was captured" while saying nothing at all about the panel.
   */
  await page.evaluate((target) => {
    const panel = document.getElementById('life-code');
    const bar = document.querySelector('header');
    const canvas = document.querySelector('canvas');
    const page = canvas?.parentElement ?? null;
    const frames: { open: string | null }[] = [];
    const scope = window as unknown as { __frames: unknown[]; __enough: boolean };
    scope.__enough = false;

    const tick = () => {
      if (panel !== null && bar !== null && canvas !== null) {
        const box = panel.getBoundingClientRect();
        const world = canvas.getBoundingClientRect();
        const rule = bar.getBoundingClientRect();
        frames.push({
          x: Math.round(box.x),
          y: Math.round(box.y),
          w: Math.round(box.width),
          barBottom: Math.round(rule.bottom),
          barRight: Math.round(rule.right),
          /*
           * In viewport coordinates, and deliberately not relative to the bar.
           *
           * Relative was the obvious way to ignore an emulated mobile browser
           * shifting things about, and it was wrong: when the page itself
           * scrolls sideways the bar and the world move together, so a
           * difference between them stays constant while both slide across the
           * screen. That is precisely the defect, measured as invariant. The
           * scroll offsets below are recorded for the same reason — they are the
           * cause, and a page that never scrolls cannot show it.
           */
          world: `${Math.round(world.x)},${Math.round(world.y)} ${Math.round(world.width)}x${Math.round(world.height)}`,
          scroll: `${Math.round(page?.scrollLeft ?? 0)},${Math.round(page?.scrollTop ?? 0)}`,
          open: panel.getAttribute('data-open'),
        } as { open: string | null });
      }

      // Enough of the movement to have caught a flash: the transition is about
      // a dozen frames, so twelve in the new state covers it and then some.
      if (frames.filter((frame) => frame.open === target).length >= 12) {
        scope.__enough = true;
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    scope.__frames = frames;
  }, becoming);

  // Running before the press, or the recording begins in the middle of the
  // thing it was meant to watch.
  await page.waitForFunction(() => (window as unknown as { __frames: unknown[] }).__frames.length >= 2);

  await aplToggle(page).click();
  await page.waitForFunction(() => (window as unknown as { __enough: boolean }).__enough, null, {
    timeout: 30_000,
  });

  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

test.describe('Game of Life', () => {
  test.use({ viewport: WIDE });

  test('runs entirely in the browser, asking TryAPL for nothing', async ({ page }) => {
    const requests = await openLife(page);

    // Long enough for dozens of generations at the default speed. Every one of
    // them a network round trip would be both slow and rude.
    await page.waitForTimeout(2500);
    await expect
      .poll(async () => Number(/Generation (\d+)/u.exec(await readout(page))?.[1] ?? 0))
      .toBeGreaterThan(3);

    expect(requests, 'the animation reached for the network').toEqual([]);
  });

  test('leaves every control of the bar pressable while the APL is open', async ({ page }) => {
    /*
     * The regression this file was written for.
     *
     * The panel used to begin at the top of the window and indent its own
     * contents to clear the bar. The bar runs the full width underneath it and
     * the panel is opaque, so what actually happened is that the bar's
     * right-hand end was buried: at 1440 that was Clear, Speed, Palette, Hide
     * controls and View APL itself; at 1024 it took Step, Randomise and Reset
     * as well. Nothing was removed, so nothing failed.
     */
    await openLife(page);
    expect(await coveredControls(page)).toEqual([]);

    await openPanel(page);

    expect(await coveredControls(page), 'the panel is sitting on top of the controls').toEqual([]);

    // And the panel is genuinely below the bar rather than merely behind it.
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('header')?.getBoundingClientRect();
      const panel = document.getElementById('life-code')?.getBoundingClientRect();
      if (bar === undefined || panel === undefined) return Number.NaN;
      return Math.round(panel.y - bar.bottom);
    });
    expect(Math.abs(gap), 'the panel does not begin where the bar ends').toBeLessThanOrEqual(1);
  });

  test('moves the panel and nothing else, opening and closing', async ({ page }) => {
    /*
     * The defect somebody actually sees, and the reason this is a side panel.
     *
     * Opening used to drag the world with it. The panel is still off the
     * right-hand edge at the moment focus moves into it, and `overflow: hidden`
     * leaves a box that can still be scrolled programmatically — so the browser
     * scrolled the off-screen panel into view and took the canvas along:
     * measured as the world jumping 549px left and easing back over the next
     * dozen frames. Closing never did it, because focus returns to a button that
     * was on screen all along, which is why opening and closing looked like two
     * different gestures.
     *
     * So both directions are recorded frame by frame, and the world's geometry
     * has to be a single value throughout each: one position, one size, no
     * recentring, no reflow. Only the panel's own left edge may change.
     */
    await openLife(page);
    await page.getByRole('button', { name: 'Pause' }).click();

    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const where = `${String(size.width)}×${String(size.height)}`;

      for (const direction of ['true', 'closed'] as const) {
        const frames = await framesWhileToggling(page, direction);
        const what = direction === 'true' ? 'opening' : 'closing';

        const worlds = [...new Set(frames.map((frame) => frame.world))];
        expect(worlds, `${where}: the world moved while ${what} — ${worlds.join(' then ')}`).toHaveLength(1);

        // The cause, named directly: an overlay must never scroll the page.
        const scrolls = [...new Set(frames.map((frame) => frame.scroll))];
        expect(scrolls, `${where}: the page scrolled while ${what} — ${scrolls.join(' then ')}`).toEqual([
          '0,0',
        ]);

        // And the panel really did travel, so the frames were worth reading.
        expect(
          new Set(frames.map((frame) => frame.x)).size,
          `${where}: the panel did not move while ${what}`,
        ).toBeGreaterThan(1);
      }
    }
  });

  test('opens straight into its final geometry, at every width', async ({ page }) => {
    /*
     * The defect somebody actually sees, as distinct from the one measured with
     * a hit test.
     *
     * The panel used to be positioned from a height this page measured after
     * mounting and published as a custom property. A measurement taken after the
     * first paint does not exist during the first paint, so the panel was drawn
     * once against the fallback and then relocated — recorded from a window
     * about 998 wide as a left edge going 438 → 0 → 341 → 454, a full-width
     * flash and a horizontal teleport in the middle of opening. Waiting for it to
     * settle makes a test pass and leaves the flash exactly where it was.
     *
     * So this samples every frame and holds two things absolute throughout:
     * the panel's width, and its top edge against the bottom of the bar. Neither
     * is animated, so neither has any business changing between frames.
     *
     * Its left edge is checked one-sidedly — never further left than where it
     * ends up. That is the difference between arriving from the right, which is
     * the intended movement, and appearing full-width first, which is the fault:
     * a full-width flash puts the left edge at zero, well left of the final
     * position at every width where the two differ.
     */
    await openLife(page);
    const panel = page.getByRole('dialog', { name: /APL behind this artwork/u });

    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      /*
       * Resized with the panel shut, then opened. Three widths in one session
       * rather than three visits, which also settles a second question: the bar
       * wraps from one row to five between these sizes, and the panel has to
       * follow it without having been told.
       */
      await page.setViewportSize(size);
      await expect(panel).toHaveAttribute('data-open', 'closed');

      const frames = await framesWhileToggling(page, 'true');
      /*
       * The last frame in which the panel was open, rather than the last frame
       * recorded. Under a loaded machine the sampler's window can close while the
       * press is still being delivered, and "the final frame happened to be an
       * open one" is a fact about the machine rather than about the panel.
       */
      const settled = frames.filter((frame) => frame.open === 'true').at(-1);
      expect(settled, `${size.width}: the panel never opened`).toBeDefined();

      const where = `${String(size.width)}×${String(size.height)}`;
      const expectedWidth = Math.min(544, size.width);

      /*
       * Every position is taken relative to the bar rather than to the viewport.
       * An emulated mobile browser pans its visual viewport by a few pixels as
       * focus moves into the panel, which shifts everything fixed on the page at
       * once; a difference between two elements in the same frame is unmoved by
       * that, and is the thing being asserted anyway.
       */
      const inset = (frame: Frame) => frame.barRight - frame.x;
      const settledInset = settled === undefined ? 0 : inset(settled);

      for (const frame of frames) {
        expect(frame.w, `${where}: the panel changed width while opening`).toBe(expectedWidth);
        expect(frame.y, `${where}: the panel was not against the bottom of the bar`).toBe(frame.barBottom);
        expect(
          inset(frame),
          `${where}: the panel reached further across the window than where it settled — a flash, not an arrival`,
        ).toBeLessThanOrEqual(settledInset);
      }

      // And a last check that the frames were worth anything: the panel really
      // did move, so the sampling covered an opening rather than a still page.
      expect(
        new Set(frames.map((frame) => inset(frame))).size,
        `${where}: nothing was captured`,
      ).toBeGreaterThan(1);

      await page.keyboard.press('Escape');
      await expect(panel).toHaveAttribute('data-open', 'closed');
    }
  });

  test('is unmoved by the panel opening, closing and opening again', async ({ page }) => {
    const requests = await openLife(page);
    await page.getByRole('button', { name: 'Pause' }).click();

    const before = await readout(page);
    /*
     * Size, not position. The world is drawn into a fixed full-window layer, and
     * an emulated mobile browser can pan its visual viewport by a few pixels
     * while focus moves about — which shifts every fixed element's reported
     * position without anything on the page having changed. What this test
     * claims is that the panel did not resize the world, so that is what it
     * compares.
     */
    const sizeOfWorld = async () => {
      const box = await page.getByRole('img').first().boundingBox();
      return box === null ? null : { width: Math.round(box.width), height: Math.round(box.height) };
    };
    const canvasBefore = await sizeOfWorld();

    for (let round = 0; round < 3; round += 1) {
      const panel = await openPanel(page);
      // Paused, so this is the whole world: same size, same generation, same
      // population. A panel that rebuilt it would show here.
      expect(await readout(page)).toBe(before);

      await page.keyboard.press('Escape');
      await expect(panel).toHaveAttribute('data-open', 'closed');
      expect(await readout(page)).toBe(before);
    }

    // Not resized either, which would be a different way of disturbing it.
    expect(await sizeOfWorld()).toEqual(canvasBefore);
    expect(requests).toEqual([]);
  });

  test('keeps the world when the controls are hidden and brought back', async ({ page }) => {
    await openLife(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const world = worldOf(await readout(page));

    await page.getByRole('button', { name: 'Hide controls' }).click();
    await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible();
    // The way out goes with the rest of the interface, deliberately.
    await expect(page.getByRole('link', { name: 'Gallery' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Show controls' }).click();
    await expect(page.getByRole('link', { name: 'Gallery' })).toBeVisible();

    await openPanel(page);
    expect(await coveredControls(page)).toEqual([]);
    expect(worldOf(await readout(page))).toBe(world);
  });

  test('gives the keyboard to the panel and hands it back', async ({ page }) => {
    await openLife(page);
    const toggle = aplToggle(page);
    await toggle.click();

    // The panel itself: there is no button inside it to receive the keyboard,
    // and the whole content is what somebody opened it to read.
    const panel = page.getByRole('dialog', { name: /APL behind this artwork/u });
    await expect(panel).toBeFocused();

    // One press undoes one thing: the panel closes and the interface stays.
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveText('View APL');
    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible();
  });

  test('is one button that says which way it goes, and the only way to shut it', async ({ page }) => {
    await openLife(page);
    const toggle = aplToggle(page);
    const panel = page.getByRole('dialog', { name: /APL behind this artwork/u });

    await expect(toggle).toHaveText('View APL');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'life-code');

    await openPanel(page);
    await expect(toggle).toHaveText('Hide APL');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // No second control for the same piece of state, anywhere in the content.
    await expect(panel.getByRole('button', { name: 'Close' })).toHaveCount(0);

    await toggle.click();
    await expect(panel).toHaveAttribute('data-open', 'closed');
    await expect(toggle).toHaveText('View APL');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Game of Life on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps its controls and its way out clear of the panel', async ({ page }) => {
    await openLife(page);
    await openPanel(page);

    // The bar wraps to several rows at this width — measured at 224px against
    // 66px on a monitor — which is exactly why the panel is told where the bar
    // ends rather than assuming a height.
    expect(await coveredControls(page)).toEqual([]);
    await expect(page.getByRole('link', { name: 'Gallery' })).toBeVisible();

    // The panel is the rest of the window, and scrolls within itself.
    const scrolls = await page.evaluate(() => {
      const panel = document.getElementById('life-code');
      return panel !== null && panel.scrollHeight > panel.clientHeight;
    });
    expect(scrolls).toBe(true);
  });
});
