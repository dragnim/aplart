/**
 * The shape of a session on a desktop screen.
 *
 * Every assertion here failed at least once against a layout that looked
 * plausible in a screenshot taken at the right window size: the artwork's track
 * was hundreds of pixels wider than the square it drew, the controls panel was
 * capped and hid its own four actions on any window shorter than about a thousand
 * pixels, and a sticky artwork hung over the expanded technical workspace so its
 * text was painted across the pattern.
 *
 * Geometry is therefore measured rather than looked at, at three window sizes,
 * closed and expanded, and after scrolling — because the overlap only appeared
 * once the page moved.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

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

const playPanel = (page: Page) => page.getByRole('region', { name: 'Make it yours' });
const canvas = (page: Page) => page.locator('canvas').first();
const summary = (page: Page) => page.getByText('Code and full controls');

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

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const size of SIZES) {
  test.describe(`a session at ${size.name}`, () => {
    test('sets a modest gutter between the artwork and its controls', async ({ page }) => {
      await openSession(page, size);

      const gutter = async () => {
        const picture = await canvas(page).boundingBox();
        const panel = await playPanel(page).boundingBox();
        return (panel?.x ?? 0) - ((picture?.x ?? 0) + (picture?.width ?? 0));
      };

      // A gutter, not a gulf. It was 396px here when the artwork's grid track was
      // a fraction of the window rather than the width of the square.
      const closed = await gutter();
      expect(closed).toBeGreaterThanOrEqual(16);
      expect(closed).toBeLessThanOrEqual(48);

      /*
       * And unchanged with the technical row expanded. Measured in both states
       * because the row spans both columns: while the artwork's track was `auto`,
       * expanding it sized that track to the technical content and pushed the
       * controls three hundred pixels sideways — a defect a closed-state
       * measurement passed happily.
       */
      await summary(page).click();
      await page.waitForTimeout(300);
      expect(await gutter()).toBe(closed);
    });

    test('gives the Play panel its content, with no scrollbar of its own', async ({ page }) => {
      await openSession(page, size);

      const clipped = await playPanel(page).evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));

      expect(clipped.scrollHeight).toBeLessThanOrEqual(clipped.clientHeight + 1);
      expect(clipped.overflowY).not.toBe('auto');
      expect(clipped.overflowY).not.toBe('scroll');
    });

    test('shows all four actions, inside the panel and inside the page', async ({ page }) => {
      await openSession(page, size);

      const panel = await playPanel(page).boundingBox();
      for (const name of ['Randomise', 'Undo', 'Save image', 'Share']) {
        const button = await playPanel(page).getByRole('button', { name, exact: true }).boundingBox();

        expect(button, name).not.toBeNull();
        expect(button?.height ?? 0, name).toBeGreaterThan(0);
        // Within the panel's own box, which is what "not clipped" means for a
        // panel that used to scroll internally.
        expect((button?.y ?? 0) + (button?.height ?? 0), name).toBeLessThanOrEqual(
          (panel?.y ?? 0) + (panel?.height ?? 0) + 1,
        );
      }
    });

    test('puts the disclosure below the artwork rather than over it', async ({ page }) => {
      await openSession(page, size);

      const picture = await documentBox(page, 'canvas');
      const bar = await summary(page).boundingBox();

      expect(bar?.y ?? 0).toBeGreaterThanOrEqual((picture?.y ?? 0) + (picture?.height ?? 0));
      // And it is a bar: opaque, bordered, and as wide as the composition above it.
      const style = await summary(page).evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          background: computed.backgroundColor,
          border: computed.borderTopWidth,
          width: element.getBoundingClientRect().width,
        };
      });
      expect(style.background).not.toContain('rgba(0, 0, 0, 0)');
      expect(Number.parseFloat(style.border)).toBeGreaterThan(0);
      expect(style.width).toBeGreaterThan(400);
    });

    test('expanding it makes the document taller rather than layering it', async ({ page }) => {
      await openSession(page, size);

      const before = await page.evaluate(() => document.documentElement.scrollHeight);
      await summary(page).click();
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => document.documentElement.scrollHeight);

      expect(after).toBeGreaterThan(before);
    });

    test('keeps every technical control clear of the artwork, before and after scrolling', async ({
      page,
    }) => {
      await openSession(page, size);
      await summary(page).click();
      await page.waitForTimeout(300);

      const picture = await documentBox(page, 'canvas');
      expect(picture).not.toBeNull();

      // The whole technical block first, then the individual controls inside it.
      const editor = await documentBox(page, '.cm-editor');
      expect(editor?.y ?? 0).toBeGreaterThanOrEqual((picture?.y ?? 0) + (picture?.height ?? 0));

      const intersecting = await page.evaluate(() => {
        const canvasRect = document.querySelector('canvas')?.getBoundingClientRect();
        if (canvasRect === undefined) return ['no canvas'];

        const area = {
          x: canvasRect.x + window.scrollX,
          y: canvasRect.y + window.scrollY,
          width: canvasRect.width,
          height: canvasRect.height,
        };

        const details = [...document.querySelectorAll('details')].find(
          (element) => element.querySelector('summary')?.textContent === 'Code and full controls',
        );
        const found: string[] = [];

        for (const element of details?.querySelectorAll('input, select, button, .cm-editor, h2, label') ??
          []) {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const box = {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
          const hits =
            box.x < area.x + area.width &&
            area.x < box.x + box.width &&
            box.y < area.y + area.height &&
            area.y < box.y + box.height;
          if (hits) {
            found.push(
              `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 24)}"`,
            );
          }
        }
        return found;
      });

      expect(intersecting, `technical controls over the artwork:\n  ${intersecting.join('\n  ')}`).toEqual(
        [],
      );

      /*
       * And again after scrolling, which is where a pinned artwork used to meet
       * the expanded content. Document coordinates do not move when the page
       * does, so a scrolled overlap is a real one.
       */
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(200);

      const scrolledPicture = await documentBox(page, 'canvas');
      const scrolledEditor = await documentBox(page, '.cm-editor');
      expect(scrolledPicture).toEqual(picture);
      expect(overlaps(scrolledPicture as Box, scrolledEditor as Box)).toBe(false);
    });

    test('reveals the technical workspace in one opaque block, no wider than the row', async ({ page }) => {
      await openSession(page, size);

      const composition = await page.evaluate(() => {
        const canvasRect = document.querySelector('canvas')?.getBoundingClientRect();
        const panelRect = document
          .querySelector('section[aria-labelledby="play-heading"]')
          ?.getBoundingClientRect();
        if (canvasRect === undefined || panelRect === undefined) return 0;
        return panelRect.right - canvasRect.left;
      });

      await summary(page).click();
      await page.waitForTimeout(300);

      const block = await page.evaluate(() => {
        const details = [...document.querySelectorAll('details')].find(
          (element) => element.querySelector('summary')?.textContent === 'Code and full controls',
        );
        if (details === undefined) return null;
        const computed = getComputedStyle(details);
        return { background: computed.backgroundColor, width: details.getBoundingClientRect().width };
      });

      // Opaque: an alpha of anything less than one lets the artwork through, and
      // that is exactly how technical text ended up painted onto the pattern.
      expect(block?.background).toMatch(/^rgb\(/u);
      expect(block?.background).not.toMatch(/rgba/u);
      // No wider than the artwork-and-panel composition it sits beneath.
      expect(block?.width ?? 0).toBeLessThanOrEqual(composition + 2);
      expect(block?.width ?? 0).toBeGreaterThan(composition - 60);
    });
  });
}
