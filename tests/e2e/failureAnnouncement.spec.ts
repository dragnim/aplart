/**
 * A failed run says so once.
 *
 * Two live regions report a run: the Run panel's status line, and the Focus mode
 * toolbar's. Both used to carry the full failure text, so a single refusal was
 * shown twice and read out twice. Shortening one of them fixed the wording and
 * not the arithmetic — two regions still changed at once, so it still arrived as
 * two announcements.
 *
 * What is asserted here is the politeness the browser would actually act on,
 * gathered from the live DOM rather than from the source: exactly one region
 * speaks on failure, it is the assertive alert, and that holds whether Focus mode
 * is on and whether its drawer is open. Focus mode is why this is a browser test
 * — the drawer is hidden by a transform, so the alert inside it stays in the
 * accessibility tree and would be a second voice if the toolbar also spoke.
 */

import { expect, test, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';
import { pressRun } from './workspaceModes';

const WIDE = { width: 1440, height: 950 };

/** Regions that would speak, with the politeness the browser resolves for them. */
async function speakingRegions(page: Page): Promise<{ politeness: string; text: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')]
      .map((element) => {
        const role = element.getAttribute('role');
        const implied = role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : 'off';
        return {
          politeness: element.getAttribute('aria-live') ?? implied,
          text: element.textContent ?? '',
        };
      })
      .filter((region) => region.politeness !== 'off'),
  );
}

/**
 * The regions that would actually be heard.
 *
 * A region that speaks but holds no text announces nothing, and the page keeps a
 * couple of those on standby for share and action notices — a live region added
 * at the same moment as its text is often not announced at all, so they sit there
 * present and empty. Matching on wording instead would only test the wording.
 */
async function heardRegions(page: Page) {
  const regions = await speakingRegions(page);
  return regions.filter((region) => region.text.trim() !== '');
}

/**
 * Runs something the service refuses.
 *
 * A stubbed server failure rather than an oversized matrix: the subject is how a
 * failure is announced, and this is the shortest route to one.
 */
async function runAndFail(page: Page) {
  await stubTryApl(page, { failure: 'server' });
  await page.goto('./#/art/modular-bloom');
  await pressRun(page);
  await expect(page.locator('[role="alert"]').first()).toBeVisible();
}

test.describe('a failed run', () => {
  test.use({ viewport: WIDE });

  test('is announced by the alert alone', async ({ page }) => {
    await runAndFail(page);

    const heard = await heardRegions(page);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.politeness).toBe('assertive');
    expect(heard[0]?.text).toContain('The APL service did not respond');

    // Still visible in the status line, which is a state cue and not a voice.
    await expect(page.locator('[role="status"][data-status="error"]')).toHaveText('Run failed.');
  });

  test('is announced once in Focus mode, with the drawer open', async ({ page }) => {
    await runAndFail(page);

    // Focus mode opens the drawer itself, so the panel and the toolbar are both
    // on screen — the case the toolbar's existing rule already covered.
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('[data-focus="true"]')).toBeVisible();

    const heard = await heardRegions(page);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.politeness).toBe('assertive');
  });

  test('is announced once in Focus mode, with the drawer shut', async ({ page }) => {
    await runAndFail(page);
    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('[data-focus="true"]')).toBeVisible();

    /*
     * Shut, which is the case the earlier rule missed. The drawer slides away
     * under a transform, so the alert inside it is still announced; a toolbar
     * that spoke here would be the second announcement.
     */
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-drawer="closed"]').first()).toBeAttached();

    const heard = await heardRegions(page);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.politeness).toBe('assertive');

    // Both status lines are silent here, and both still show the state.
    const statuses = page.locator('[role="status"]', { hasText: 'Run failed.' });
    await expect(statuses).toHaveCount(2);
    await expect(statuses.first()).toHaveAttribute('aria-live', 'off');
    await expect(statuses.last()).toHaveAttribute('aria-live', 'off');
  });
});
