/**
 * The shape of a session on a desktop screen.
 *
 * Every assertion here failed at least once against a layout that looked
 * plausible in a screenshot taken at the right window size: the artwork's track
 * was hundreds of pixels wider than the square it drew, the controls panel was
 * capped and hid its own four actions on any window shorter than about a thousand
 * pixels, and a sticky artwork hung over the technical workspace so its text was
 * painted across the pattern.
 *
 * Those faults all came from the same arrangement — controls a page-length scroll
 * below the picture they change. The controls are now beside it, in one panel of
 * four modes, so what is measured here is that the panel and the artwork are one
 * composition and that changing mode moves neither of them.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { runButton } from './workspaceModes';

const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
];

const SEED = 20_260_805;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const panel = (page: Page) => page.locator('[data-session-panel]');
const canvas = (page: Page) => page.locator('canvas').first();
const modeTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

async function openSession(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await stubTryApl(page);
  await page.goto(`./#/art/modular-bloom?play=${String(SEED)}`);
  await expect(page.getByRole('img', { name: /grid/ })).toBeVisible({ timeout: 30_000 });
  // The canvas settles its size after the first paint; measuring before that
  // compares a square against the box it is about to leave.
  await page.waitForTimeout(300);
}

/** Boxes in document coordinates, so a comparison survives scrolling. */
async function documentBox(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((query) => {
    const element = document.querySelector(query);
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }, selector);
}

for (const size of SIZES) {
  test.describe(`a session at ${size.name}`, () => {
    test('sets a modest gutter between the artwork and its controls', async ({ page }) => {
      await openSession(page, size);

      const gutter = async () => {
        const picture = await canvas(page).boundingBox();
        const box = await panel(page).boundingBox();
        return (box?.x ?? 0) - ((picture?.x ?? 0) + (picture?.width ?? 0));
      };

      // A gutter, not a gulf. It was 396px here when the artwork's grid track was
      // a fraction of the window rather than the width of the square.
      const closed = await gutter();
      expect(closed).toBeGreaterThanOrEqual(16);
      expect(closed).toBeLessThanOrEqual(48);

      /*
       * And unchanged in every mode. Measured in each because the panel's content
       * differs wildly between them — an editor in one, a dozen controls in
       * another — and a panel whose width followed its content would move the
       * artwork every time somebody changed tab.
       */
      for (const mode of ['Colour', 'Animate', 'Advanced', 'Code']) {
        await modeTab(page, mode).click();
        await page.waitForTimeout(200);
        expect(await gutter(), mode).toBe(closed);
      }
    });

    test('shows the whole square, with room to breathe under it', async ({ page }) => {
      await openSession(page, size);

      const picture = await canvas(page).boundingBox();
      const box = await panel(page).boundingBox();
      const foot = (picture?.y ?? 0) + (picture?.height ?? 0);

      /*
       * The whole artwork, in the window, without scrolling.
       *
       * It ran four hundred pixels past the fold while the width alone decided
       * its size — which meant editing a picture whose foot you could not see.
       * The height decides now, and this is the assertion that says so.
       */
      expect(picture?.y ?? 0).toBeGreaterThanOrEqual(0);
      expect(picture?.y ?? 0).toBeLessThan(size.height * 0.35);
      expect(foot, `foot ${String(foot)} of ${String(size.height)}`).toBeLessThanOrEqual(size.height);

      // Room beneath it, rather than the square landing on the window's edge.
      expect(size.height - foot).toBeGreaterThanOrEqual(8);

      /*
       * And the artwork leads the row, at the largest size the window allows.
       *
       * This used to require the artwork to be wider than the panel. That cannot
       * be held to on a window that is wide relative to its height, and insisting
       * on it is what produced the fault it was written to prevent: the square is
       * capped by the height, so keeping the panel narrower than it meant leaving
       * the difference lying somewhere — and it lay against the page's left
       * margin, sliding the whole composition right, away from the title above
       * it. Measured at 1440x800: 211px of nothing.
       *
       * What is worth holding to is that the artwork starts the row at the page's
       * own margin, that it is as large as the height permits, and that no width
       * is left unused. The panel takes the balance and reads as roomy rather
       * than as a hole.
       */
      const panelBox = box ?? { x: 0, width: 0, height: 0, y: 0 };

      // Leading: the artwork starts the row, and the panel sits after it.
      expect(panelBox.x).toBeGreaterThanOrEqual((picture?.x ?? 0) + (picture?.width ?? 0) - 1);

      /*
       * And the composition lines up with the page's own margins.
       *
       * The title is the reference because it is what the eye compares the
       * artwork against: they sit one above the other, and the artwork drifting
       * right of it is exactly what the bias looked like.
       */
      const title = await page.getByRole('heading', { level: 1 }).boundingBox();
      expect(Math.round((picture?.x ?? 0) - (title?.x ?? 0))).toBeLessThanOrEqual(1);

      // The other edge likewise: the panel finishes where the page's actions do.
      const actions = await page.getByRole('button', { name: 'Export' }).boundingBox();
      const panelRight = panelBox.x + panelBox.width;
      const actionsRight = (actions?.x ?? 0) + (actions?.width ?? 0);
      expect(Math.abs(panelRight - actionsRight)).toBeLessThanOrEqual(1);
    });

    test('uses the width it has, without overflowing it', async ({ page }) => {
      await openSession(page, size);

      const measured = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));

      // No horizontal scrolling, at any size: a row whose tracks outgrow their
      // container pushes the page sideways, which is worse than a small artwork.
      expect(measured.overflow, `${String(measured.scrollWidth)} > ${String(measured.innerWidth)}`).toBe(
        false,
      );

      /*
       * And the composition is not marooned in the middle of the window.
       *
       * Two thirds rather than the three quarters this once asked for: a square
       * that fits a 16:9 window vertically cannot also fill it horizontally, and
       * fitting the whole artwork is worth more than the last few per cent of
       * width. The panel takes back part of the difference by growing with the
       * artwork it sits beside.
       */
      const picture = await canvas(page).boundingBox();
      const box = await panel(page).boundingBox();
      const composition = (box?.x ?? 0) + (box?.width ?? 0) - (picture?.x ?? 0);
      expect(composition / size.width).toBeGreaterThan(0.65);
      // Not edge to edge either — the page keeps its margin.
      expect(composition).toBeLessThanOrEqual(size.width - 48);
    });

    test('gives its controls one size', async ({ page }) => {
      await openSession(page, size);

      /*
       * Measured as a family rather than against a number: eighteen controls in
       * a session once shared one height — the touch target — and diverged in
       * type and padding, which is what made them look like several generations
       * of interface at once. What matters is that they agree, not that they
       * agree on 32px, so the assertion is about the spread.
       */
      const sizes = await page.evaluate(() => {
        const groups = new Map<string, number>();
        for (const element of document.querySelectorAll(
          '[data-session-panel] button, [role="tab"], header ~ * button',
        )) {
          const rect = element.getBoundingClientRect();
          if (rect.height === 0) continue;
          const style = getComputedStyle(element);
          // Sliders and other non-button controls are a different family.
          if (element.tagName !== 'BUTTON' && element.getAttribute('role') !== 'tab') continue;
          const key = `${String(Math.round(rect.height))}/${style.fontSize}/${style.borderRadius}`;
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        return [...groups.entries()].map(([key, count]) => `${key} ×${String(count)}`);
      });

      // One height, one type size, one radius across the session's buttons.
      const heights = new Set(sizes.map((entry) => entry.split('/')[0]));
      const fonts = new Set(sizes.map((entry) => entry.split('/')[1]));
      expect([...heights], sizes.join('  ')).toHaveLength(1);
      expect([...fonts], sizes.join('  ')).toHaveLength(1);
    });

    test('keeps the panel in the window, with its own content scrolling', async ({ page }) => {
      await openSession(page, size);

      const measured = await panel(page).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const content = element.querySelector('[role="tabpanel"]:not([hidden])')?.parentElement ?? null;
        return {
          bottom: rect.y + rect.height,
          tabsVisible: element.querySelector('[role="tablist"]')?.getBoundingClientRect().y ?? -1,
          actionsBottom:
            element.querySelector('[role="group"]')?.getBoundingClientRect().bottom ??
            Number.MAX_SAFE_INTEGER,
          contentScrolls: content === null ? 'none' : getComputedStyle(content).overflowY,
        };
      });

      /*
       * The whole panel is on screen — tab bar, current mode and the four actions
       * — whatever the artwork is doing. The artwork may run past the fold; the
       * controls may not, because a control you have to scroll the page to find
       * is the fault this arrangement exists to fix.
       */
      expect(measured.bottom).toBeLessThanOrEqual(size.height + 1);
      expect(measured.tabsVisible).toBeGreaterThanOrEqual(0);
      expect(measured.actionsBottom).toBeLessThanOrEqual(size.height + 1);
      // One scrolling region inside the panel, not several.
      expect(measured.contentScrolls).toBe('auto');
    });

    test('changing mode moves neither the artwork nor the panel', async ({ page }) => {
      await openSession(page, size);

      const before = await documentBox(page, 'canvas');
      const panelBefore = await panel(page).boundingBox();

      for (const mode of ['Colour', 'Animate', 'Advanced', 'Code', 'Create']) {
        await modeTab(page, mode).click();
        await page.waitForTimeout(200);

        // Same element, same place: the artwork is not re-rendered by a tab.
        expect(await documentBox(page, 'canvas'), mode).toEqual(before);
        const now = await panel(page).boundingBox();
        expect(now?.x, mode).toBe(panelBefore?.x);
        expect(now?.width, mode).toBe(panelBefore?.width);
      }
    });

    test('keeps the four actions available in every mode', async ({ page }) => {
      await openSession(page, size);

      for (const mode of ['Create', 'Colour', 'Animate', 'Advanced', 'Code']) {
        await modeTab(page, mode).click();
        const actions = page.getByRole('group', { name: 'Artwork actions' });

        for (const name of ['Randomise', 'Reset']) {
          await expect(
            actions.getByRole('button', { name, exact: true }),
            `${name} in ${mode}`,
          ).toBeVisible();
        }
        await expect(actions.getByRole('button', { name: /^Undo/ }), `Undo in ${mode}`).toBeVisible();
      }

      // Run belongs to Code, not to the session: it means "run this source".
      await expect(
        page.getByRole('group', { name: 'Artwork actions' }).getByRole('button', { name: /^Run/ }),
      ).toHaveCount(0);
      await modeTab(page, 'Code').click();
      await expect(await runButton(page)).toBeVisible();
    });
  });
}
