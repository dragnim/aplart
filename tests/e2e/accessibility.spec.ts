/**
 * Automated accessibility checks with axe-core.
 *
 * Automated tools catch perhaps a third of real accessibility problems, so this
 * is a floor rather than a ceiling — the keyboard journeys, the announced
 * status region and the canvas description in the other specs cover things axe
 * cannot see. But the failures axe *does* find are unambiguous, and a build
 * should not be able to introduce them quietly.
 *
 * Every violation is reported with its rule and the element, so a failure says
 * what to fix rather than just that something is wrong.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

/** WCAG 2.2 AA is the stated target. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  const results = await (context === undefined ? builder : builder.include(context)).analyze();

  if (results.violations.length > 0) {
    const report = results.violations
      .map((violation) => {
        const nodes = violation.nodes.map((node) => `      ${node.target.join(' ')}`).join('\n');
        return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${nodes}`;
      })
      .join('\n');
    throw new Error(`axe found ${results.violations.length} violation(s):\n${report}`);
  }

  expect(results.violations).toEqual([]);
}

test.describe('accessibility', () => {
  test('the gallery has no violations', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('article').first().waitFor();
    await audit(page);
  });

  test('the About page has no violations', async ({ page }) => {
    await page.goto('./#/about');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await audit(page);
  });

  test('the Help page has no violations', async ({ page }) => {
    await page.goto('./#/help');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await audit(page);
  });

  test('the not-found page has no violations', async ({ page }) => {
    await page.goto('./#/nowhere');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await audit(page);
  });

  test('a filtered gallery has no violations', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /^Fractals/ }).click();
    await audit(page);
  });
});

test.describe('accessibility of the workspace', () => {
  test.use({ viewport: { width: 1440, height: 950 } });

  test('has no violations before a run', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');
    await audit(page);
  });

  test('has no violations after a successful run', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.locator('[role="status"][data-status]')).toHaveText(/Finished in/, {
      timeout: 20_000,
    });

    await audit(page);
  });

  test('has no violations while showing an error', async ({ page }) => {
    await stubTryApl(page, { failure: 'server' });
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await audit(page);
  });

  test('has no violations with the reset dialog open', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page.locator('.cm-content').fill('size←8');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await audit(page);
  });

  test('has no violations in Focus mode, drawer open or closed', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.locator('[role="status"][data-status]')).toHaveText(/Finished in/, {
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('#focus-drawer')).toHaveAttribute('data-drawer', 'open');
    await audit(page);

    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await expect(page.locator('#focus-drawer')).toHaveAttribute('data-drawer', 'closed');
    /*
     * Worth auditing separately: the closed drawer is off screen but still in
     * the document, and axe checks contrast and naming on what it can reach.
     * The overlay bar's controls sit on the artwork rather than on a surface,
     * which is exactly the kind of thing that quietly fails contrast.
     */
    await audit(page);
  });

  test('has no violations when a fullscreen request is refused', async ({ page }) => {
    // The one fullscreen state that cannot be reached by driving the
    // interface, and the message sits over the artwork rather than a surface.
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('blocked'));
    });
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page.getByRole('button', { name: 'Focus mode' }).click();
    const fullscreen = page.getByRole('button', { name: 'Fullscreen' });
    test.skip((await fullscreen.count()) === 0, 'this browser does not offer fullscreen');

    await fullscreen.click();
    await expect(page.getByText(/Focus mode still fills the window/)).toBeVisible();
    await audit(page);
  });

  test('has no violations with a primitive explanation expanded', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    await page
      .getByRole('region', { name: 'APL used in this piece' })
      .getByRole('button', { name: /Residue/ })
      .click();

    await audit(page);
  });
});

test.describe('accessibility on a narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the gallery has no violations', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('article').first().waitFor();
    await audit(page);
  });

  test('each workspace tab has no violations', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.getByRole('tab', { name: 'Artwork' }).waitFor();
    await audit(page);

    for (const name of ['Code', 'Controls'] as const) {
      await page.getByRole('tab', { name }).click();
      await audit(page);
    }
  });

  test('the Focus-mode bottom sheet has no violations', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.getByRole('tab', { name: 'Code' }).click();

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('#focus-drawer')).toHaveAttribute('data-drawer', 'open');
    await audit(page);

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('#focus-drawer')).toHaveAttribute('data-drawer', 'closed');
    await audit(page);
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 950 } });

  // emulateMedia per test rather than a context option: contextOptions is
  // overridden by the more specific options Playwright sets itself, so the
  // preference did not actually reach the page.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('transitions are switched off, not merely shortened', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    // The duration tokens are zeroed under the media query, so every
    // transition built on them stops rather than each one needing its own rule.
    const durations = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return ['--motion-fast', '--motion-base', '--motion-slow'].map((name) =>
        root.getPropertyValue(name).trim(),
      );
    });

    // Compared as durations rather than strings: the browser normalises 0ms to
    // 0s, and asserting on the text made a passing result look like a failure.
    for (const duration of durations) {
      expect(Number.parseFloat(duration), `expected a zero duration, got ${duration}`).toBe(0);
    }
  });

  test('the gallery cards do not lift on hover', async ({ page }) => {
    await page.goto('./');
    const card = page.getByRole('article').first();
    await card.hover();

    const transform = await card.evaluate((element) => getComputedStyle(element).transform);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  });

  test('the loading indicator still turns, just slowly', async ({ page }) => {
    // Removing it entirely would leave no sign that anything is happening;
    // WCAG asks for motion to be reduced, not for feedback to be deleted.
    await stubTryApl(page, { delayMs: 2500 });
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    // The spinner overlays an existing artwork, so there has to be one first.
    // Before the first run the canvas shows a message instead, which is the
    // right thing to show when there is nothing to overlay.
    await page.getByRole('button', { name: /^Run/ }).click();
    await expect(page.locator('[role="status"][data-status]')).toHaveText(/Finished in/, {
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /^Run/ }).click();
    const duration = await page
      .locator('[class*="spinner"]')
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(duration)).toBeGreaterThanOrEqual(2);
  });
});

test.describe('target sizes', () => {
  test.use({ viewport: { width: 1440, height: 950 } });

  test('controls are comfortable to hit', async ({ page }) => {
    await stubTryApl(page);
    await page.goto('./#/art/modular-bloom');
    await page.waitForSelector('.cm-content');

    // The spec asks for roughly 44x44, which is stricter than WCAG 2.2 AA's
    // 24x24. Inline links inside prose are exempt from both and are excluded
    // here; standalone controls are not.
    const undersized = await page.evaluate(() => {
      const failures: string[] = [];
      const elements = document.querySelectorAll('button, input[type="range"], select, [role="tab"]');

      for (const element of elements) {
        const box = element.getBoundingClientRect();
        // Skip anything not currently rendered.
        if (box.width === 0 && box.height === 0) continue;
        if (box.height < 44 || box.width < 24) {
          const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
          failures.push(
            `${element.tagName.toLowerCase()} "${label.slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
          );
        }
      }
      return failures;
    });

    expect(undersized, `undersized controls:\n  ${undersized.join('\n  ')}`).toEqual([]);
  });
});
