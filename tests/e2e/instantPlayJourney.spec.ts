/**
 * The whole of Instant Play, in one sitting.
 *
 * Every other spec checks one part of this properly. This one walks the route a
 * person actually takes — arrive, start, adjust, randomise, undo, save, share,
 * look at the code, open it, edit it — and asserts that each step leaves the next
 * one possible. Its value is the joins: a feature built in stages can pass every
 * stage's own tests and still not be one thing.
 */

import { expect, test, type Page } from '@playwright/test';
import { ADAPTIVE_MARKER } from '@/execution/adaptiveProbe';
import { stubTryApl } from './stubTryApl';
import { editorLocator, editorOn, runButton } from './workspaceModes';

const playPanel = (page: Page) => page.getByRole('region', { name: 'Make it yours' });
/** The four session actions, which sit beneath the editing modes rather than in them. */
const sessionActions = (page: Page) => page.getByRole('group', { name: 'Artwork actions' });
const slider = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const artwork = (page: Page) => page.getByRole('img', { name: /grid/ });
const undo = (page: Page) => sessionActions(page).getByRole('button', { name: /^Undo/ });

const runs = (requests: readonly string[]) =>
  requests.filter((request) => request.includes(ADAPTIVE_MARKER)).length;

const valueOf = async (page: Page, label: string) => Number(await slider(page, label).inputValue());

/** Every control's value at once, which is what "the same artwork" means here. */
async function settings(page: Page): Promise<string> {
  const values = await Promise.all(['Complexity', 'Scale', 'Detail'].map((label) => valueOf(page, label)));
  return values.join('/');
}

test.describe('the Instant Play journey', () => {
  test.use({ viewport: { width: 1440, height: 950 } });

  test('arrive, make something, keep it, and open the code behind it', async ({
    page,
    context,
    browserName,
  }) => {
    const stub = await stubTryApl(page);

    // 1. Arrive at the gallery, where the invitation is the dominant thing.
    await page.goto('./');
    const start = page.getByRole('link', { name: 'Start creating' });
    await expect(start).toBeVisible();

    /*
     * 2. Choose it, and 3. receive a finished artwork without asking twice.
     *
     * Which artwork is the seed's business now: Start creating draws from four
     * pattern families rather than always opening Modular Bloom, so the press is
     * checked to land on one of them and to draw on arrival.
     */
    await start.click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Modular Bloom|Checker Shift|Wave Interference|Truchet Grid/,
      }),
    ).toBeVisible();
    await expect(artwork(page)).toBeVisible({ timeout: 30_000 });
    expect(runs(stub.requests)).toBe(1);

    /*
     * The rest of the journey is Modular Bloom's, so it is opened by name.
     *
     * Everything from here on reads that artwork's own controls — Complexity,
     * Scale, the `modulus` line a Peek explains — and those are the arithmetic
     * of this piece rather than of the pool. Writing the journey against
     * whichever artwork the seed happened to choose would mean asserting nothing
     * in particular about any of them.
     */
    await page.goto('./#/art/modular-bloom?play=20260805');
    await expect(page.getByRole('heading', { level: 1, name: 'Modular Bloom' })).toBeVisible();
    await expect(artwork(page)).toBeVisible({ timeout: 30_000 });
    const opened = await settings(page);

    /*
     * 4. Adjust each of the three: one gesture each, one run each.
     *
     * Each step waits for its own effect before the next begins — the value in the
     * control, then the run it caused. Somebody moving three sliders takes seconds
     * over it; a test that presses all three inside one frame is measuring how
     * fast the browser is rather than whether the artwork follows.
     */
    for (const label of ['Complexity', 'Scale', 'Detail']) {
      const from = await valueOf(page, label);
      const before = runs(stub.requests);
      const input = slider(page, label);

      /*
       * Whichever way has room. The seed is the gallery's own, so a control can
       * open at either end of its Play range — and a journey that always pressed
       * upwards would sit there failing whenever the variation happened to start
       * at the top.
       */
      const max = Number(await input.getAttribute('max'));
      const up = from < max;

      await input.focus();
      // Confirmed before the key is sent: under load WebKit can take a moment to
      // move focus, and a key pressed into the gap goes nowhere at all.
      await expect(input).toBeFocused();
      await page.keyboard.press(up ? 'ArrowRight' : 'ArrowLeft');

      await expect.poll(() => valueOf(page, label)).toBe(up ? from + 1 : from - 1);
      await expect.poll(() => runs(stub.requests)).toBe(before + 1);
    }
    const adjusted = await settings(page);
    expect(adjusted).not.toBe(opened);

    // 5. Randomise, more than once, and get somewhere else each time.
    const seen = new Set([adjusted]);
    for (let press = 0; press < 3; press += 1) {
      const before = await settings(page);
      await sessionActions(page).getByRole('button', { name: 'Randomise', exact: true }).click();
      await expect.poll(() => settings(page)).not.toBe(before);
      seen.add(await settings(page));
    }
    expect(seen.size).toBeGreaterThan(2);

    /*
     * 6. Step back over each Randomise, then over each gesture before them.
     *
     * Six presses for six things done: three sliders moved and three Randomises.
     * Counted out rather than guessed at, because that is the promise — one step
     * per thing somebody did, in the order they did them.
     */
    const beforeUndo = runs(stub.requests);
    for (let press = 0; press < 3; press += 1) await undo(page).click();
    await expect.poll(() => settings(page)).toBe(adjusted);

    for (let press = 0; press < 3; press += 1) await undo(page).click();
    await expect.poll(() => settings(page)).toBe(opened);
    // Nothing was asked of the service to go backwards: the artwork came from the
    // history, which is the whole reason it holds one.
    expect(runs(stub.requests)).toBe(beforeUndo);
    await expect(undo(page)).toBeDisabled();

    // 7. Take the image away. Export, where Save image used to be: the same act
    //    through the control that offers a size for it.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: '1024 × 1024' }).click();
    const file = await (await download).path();
    const { readFile } = await import('node:fs/promises');
    expect([...(await readFile(file)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // 8. Share it, and open what was shared. Chromium only, for the clipboard.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const sessionUrl = page.url();

      // Share is in the toolbar now, beside Export: both act on the finished
      // artwork rather than on the editing of it.
      await page.getByRole('button', { name: 'Share' }).click();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      expect(link).toContain('#/art/modular-bloom?s=');

      await page.goto(link);
      await expect(page.getByText(/shared with you/)).toBeVisible();
      /*
       * A share is somebody else's creation, so it waits to be run rather than
       * drawing itself. It arrives in the same workspace as everything else —
       * the curated controls belong to the artwork, and a link is not entitled
       * to withhold them — which is the part of this that changed.
       */
      await expect(page.getByText('Press Run to draw this artwork.')).toBeVisible();
      await expect(playPanel(page)).toBeVisible();
      await expect(await editorOn(page)).toBeVisible();

      // Back to the session, which is still exactly where it was left.
      await page.goto(sessionUrl);
      await expect(artwork(page)).toBeVisible({ timeout: 30_000 });
      expect(await settings(page)).toBe(opened);
    }

    // 9. Ask a control what it does, and read the line it names.
    const peek = page.locator('details[data-control="modulus"]');
    await peek.getByText('How this changes the APL').click();
    await expect(peek).toContainText(`modulus←${String(await valueOf(page, 'Scale'))}`);

    /*
     * 10. Open the APL at that line, with the value selected and ready to type.
     *
     * A passive locator: "Edit the APL" has already selected the Code mode, and
     * pressing the tab again to look would move focus to the tab — taking the
     * selection with it, and with it the point of the next two steps.
     */
    await peek.getByRole('button', { name: /^Edit the APL/ }).click();
    await expect(editorLocator(page)).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(
      String(await valueOf(page, 'Scale')),
    );

    // 11. Edit it directly. The control follows the code, because the code is
    // what it reads.
    await page.keyboard.type('13');
    await expect(editorLocator(page)).toContainText('modulus←13');
    await expect.poll(() => valueOf(page, 'Scale')).toBe(13);

    // 12. And the history that could no longer be trusted is gone, rather than
    // waiting to undo somebody's typing away.
    await expect(undo(page)).toBeDisabled();

    // The artwork is still there, and Run is still the way to draw the edit.
    await expect(artwork(page)).toBeVisible();
    await expect(await runButton(page)).toBeVisible();
  });
});
