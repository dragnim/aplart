/**
 * Controls taking their active and selected colours from the artwork's palette.
 *
 * Computed style throughout, compared against the custom properties themselves
 * rather than against hard-coded hexes — so these assert the wiring ("this
 * control uses the solid token") rather than the colour science, which
 * `interfaceAccent.test.ts` owns. A control that stops reading its token fails
 * here even if the derivation changes what that token is.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubTryApl } from './stubTryApl';

const WIDE = { width: 1440, height: 950 };
const NARROW = { width: 390, height: 780 };

/** A custom property, resolved to the rgb() form computed style reports. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((property) => {
    const shell = document.querySelector('[data-accent]') as Element;
    const hex = getComputedStyle(shell).getPropertyValue(property).trim();
    const probe = document.createElement('span');
    probe.style.color = hex;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, name);
}

const css = (locator: Locator, property: string) =>
  locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);

/**
 * Waits until what is painted equals the property it is meant to follow.
 *
 * Both sides are re-read on every attempt. Reading the token once and then
 * polling the paint races the fill transition, and reading the paint once races
 * it the other way — the only stable statement is "these two agree now".
 */
async function follows(page: Page, locator: Locator, property: string, name: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const painted = await css(locator, property);
        const expected = await token(page, name);
        return painted === expected ? 'agrees' : `painted ${painted}, token ${expected}`;
      },
      { timeout: 5_000 },
    )
    .toBe('agrees');
}

/** The heaviest text anywhere inside a control, whichever element carries it. */
const heaviestWeight = (control: Locator) =>
  control.evaluate((node) =>
    Math.max(...[...node.querySelectorAll('*')].map((child) => Number(getComputedStyle(child).fontWeight))),
  );

const runStatus = (page: Page) => page.locator('[role="status"][data-status]');
const runButton = (page: Page) => page.getByRole('button', { name: /^Run/ });

async function openArtwork(page: Page, id: string, heading: string) {
  await stubTryApl(page);
  await page.goto(`./#/art/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('themed controls', () => {
  test.use({ viewport: WIDE });

  test('the primary action is the one filled control, and its states differ', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const solid = await token(page, '--ui-accent-solid');
    const hover = await token(page, '--ui-accent-solid-hover');
    const onSolid = await token(page, '--ui-accent-on-solid');

    // Resting.
    await follows(page, runButton(page), 'background-color', '--ui-accent-solid');
    await follows(page, runButton(page), 'color', '--ui-accent-on-solid');
    expect(hover).not.toBe(solid);
    expect(onSolid).not.toBe(solid);

    // Hover.
    await runButton(page).hover();
    await follows(page, runButton(page), 'background-color', '--ui-accent-solid-hover');

    // Pressed, held down so the active rule is the one in effect throughout.
    const box = await runButton(page).boundingBox();
    await page.mouse.move((box as { x: number }).x + 10, (box as { y: number }).y + 10);
    await page.mouse.down();
    await follows(page, runButton(page), 'background-color', '--ui-accent-solid-active');
    const pressed = await css(runButton(page), 'background-color');
    await page.mouse.up();
    expect(pressed).not.toBe(hover);
  });

  test('secondary actions stay neutral', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const surface = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--surface'),
    );
    const neutral = await token(page, '--surface');

    // Reset and Share are ordinary actions and must not look chosen.
    for (const name of ['Share', 'Reset']) {
      const button = page.getByRole('button', { name }).first();
      if ((await button.count()) === 0) continue;
      const background = await css(button, 'background-color');
      expect([neutral, 'rgba(0, 0, 0, 0)', 'transparent']).toContain(background);
      expect(background).not.toBe(await token(page, '--ui-accent-solid'));
    }
    expect(surface.trim()).not.toBe('');
  });

  test('sliders take the accent, and still work from the keyboard', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const solid = await token(page, '--ui-accent-solid');
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      await expect(sliders.nth(index)).toHaveCSS('accent-color', solid);
    }

    // Behaviour untouched: the arrow keys still move the value by one step.
    const first = sliders.first();
    await first.focus();
    const before = await first.inputValue();
    await page.keyboard.press('ArrowRight');
    const after = await first.inputValue();
    expect(Number(after)).not.toBe(Number(before));

    await page.keyboard.press('ArrowLeft');
    expect(Number(await first.inputValue())).toBe(Number(before));
  });

  test('checked controls colour the box and keep their tick', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const box = page.getByRole('checkbox', { name: /Invert palette/ });
    await expect(box).toHaveCSS('accent-color', await token(page, '--ui-accent-solid'));

    // The state itself is the native checkbox's, and stays that way.
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(box).toBeChecked();
    await expect(box).toHaveCSS('accent-color', await token(page, '--ui-accent-solid'));
  });

  test('the selected palette card is ringed, tinted and bold; the others are not', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const border = await token(page, '--ui-accent-border');
    const soft = await token(page, '--ui-accent-soft');

    const selected = page.getByRole('radio', { name: /Poolrooms/ });
    const other = page.getByRole('radio', { name: /Forest/ });

    await expect(selected).toHaveAttribute('aria-checked', 'true');
    await expect(selected).toHaveCSS('border-top-color', border);
    await expect(selected).toHaveCSS('background-color', soft);

    await expect(other).toHaveAttribute('aria-checked', 'false');
    expect(await css(other, 'border-top-color')).not.toBe(border);
    expect(await css(other, 'background-color')).not.toBe(soft);

    // Not colour alone: the selected name is heavier than the others.
    // The heaviest text anywhere in the card, so this does not depend on which
    // element the stylesheet happens to put the weight on.
    const weightOf = (card: Locator) =>
      card.evaluate((node) =>
        Math.max(
          ...[...node.querySelectorAll('*')].map((child) => Number(getComputedStyle(child).fontWeight)),
        ),
      );
    expect(await weightOf(selected)).toBeGreaterThan(await weightOf(other));
  });

  test('a monochrome palette still marks its selection', async ({ page }) => {
    await openArtwork(page, 'truchet-grid', 'Truchet Grid');

    const border = await token(page, '--ui-accent-border');
    const selected = page.getByRole('radio', { name: /Mono/ });
    const other = page.getByRole('radio', { name: /Neon/ });

    // The accent is a grey here, by design — so the ring has to differ from the
    // ordinary border rather than merely be colourful.
    await expect(selected).toHaveCSS('border-top-color', border);
    expect(await css(selected, 'border-top-color')).not.toBe(await css(other, 'border-top-color'));
    expect(await css(selected, 'box-shadow')).not.toBe('none');
  });

  test('focus stays the stable blue, on selected controls as much as unselected', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const stable = await token(page, '--focus');
    const accent = await token(page, '--ui-accent-border');
    expect(stable).not.toBe(accent);

    for (const name of [/Poolrooms/, /Forest/]) {
      const card = page.getByRole('radio', { name });
      await card.focus();
      await expect(card).toBeFocused();
      expect(await css(card, 'outline-color')).toBe(stable);
      expect(Number.parseFloat(await css(card, 'outline-width'))).toBeGreaterThanOrEqual(2);
    }

    // So a focused selected card shows both: an accent ring inside, blue outside.
    const selected = page.getByRole('radio', { name: /Poolrooms/ });
    expect(await css(selected, 'border-top-color')).toBe(accent);
  });

  test('the playing state is what carries the accent, not the button', async ({ page }) => {
    await openArtwork(page, 'mandelbrot-field', 'Mandelbrot Field');
    await runButton(page).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    const animate = page.getByRole('button', { name: 'Animate palette' });
    const solid = await token(page, '--ui-accent-solid');

    // Stopped: as neutral as its neighbours.
    expect(await css(animate, 'background-color')).not.toBe(solid);

    await animate.click();
    const pause = page.getByRole('button', { name: 'Pause' });
    await expect(pause).toBeVisible();

    // Away from the button, or hover would be the state under test.
    await page.mouse.move(5, 5);
    await follows(page, pause, 'background-color', '--ui-accent-solid');

    // And frames do not repaint it: the colour follows the palette, not the phase.
    const during = await css(pause, 'background-color');
    await page.waitForTimeout(1_200);
    expect(await css(pause, 'background-color')).toBe(during);
    await follows(page, pause, 'color', '--ui-accent-on-solid');

    await pause.click();
    await expect(page.getByRole('button', { name: 'Animate palette' })).toBeVisible();
    expect(await css(page.getByRole('button', { name: 'Animate palette' }), 'background-color')).not.toBe(
      solid,
    );
  });

  test('a control on the artwork itself uses the dark variants', async ({ page }) => {
    await openArtwork(page, 'mandelbrot-field', 'Mandelbrot Field');
    await runButton(page).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });

    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 700, y: 470 } });
    const handoff = page.getByRole('button', { name: 'Open as Julia set' });
    await expect(handoff).toBeVisible();

    // It sits on the picture, which is dark, so the dark border variant — not the
    // light one, which would be too dark to see there.
    expect(await css(handoff, 'border-top-color')).toBe(await token(page, '--ui-accent-border-on-dark'));
    expect(await css(handoff, 'border-top-color')).not.toBe(await token(page, '--ui-accent-border'));
  });

  test('semantic colours are untouched by the palette', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    // A run that cannot succeed, so the failure styling is on screen.
    await page.route('**/Exec', (route) => route.abort());
    await runButton(page).click();

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 30_000 });

    const error = await token(page, '--error');
    const accents = await Promise.all(
      ['--ui-accent-solid', '--ui-accent-text', '--ui-accent-border'].map((name) => token(page, name)),
    );

    const colours = await alert.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.color, style.borderTopColor, style.backgroundColor];
    });
    for (const colour of colours) expect(accents).not.toContain(colour);
    expect(error).not.toBe('');
  });

  test('disabled controls keep their own quiet treatment', async ({ page }) => {
    await openArtwork(page, 'mandelbrot-field', 'Mandelbrot Field');

    // Before a run there is nothing to reset the view to, so that control is off.
    const disabled = page.locator('button:disabled').first();
    if ((await disabled.count()) === 0) test.skip(true, 'no disabled control on this screen');

    expect(await css(disabled, 'background-color')).not.toBe(await token(page, '--ui-accent-solid'));
    expect(Number.parseFloat(await css(disabled, 'opacity'))).toBeLessThan(1);
  });
});

test.describe('themed controls, narrow screen', () => {
  test.use({ viewport: NARROW });

  test('the selected tab is accent text on a raised card, not a filled block', async ({ page }) => {
    await openArtwork(page, 'julia-set', 'Julia Set');

    const selected = page.getByRole('tab', { name: 'Artwork' });
    const other = page.getByRole('tab', { name: 'Code' });

    await follows(page, selected, 'color', '--ui-accent-text');
    expect(await css(selected, 'background-color')).not.toBe(await token(page, '--ui-accent-solid'));

    // Weight and a raised surface carry it too, so colour is not the only cue.
    expect(Number(await css(selected, 'font-weight'))).toBeGreaterThan(
      Number(await css(other, 'font-weight')),
    );
    expect(await css(selected, 'box-shadow')).not.toBe('none');
    expect(await css(other, 'color')).not.toBe(await token(page, '--ui-accent-text'));
  });
});

test.describe('the whole control journey', () => {
  test.use({ viewport: WIDE });

  test('from artwork through a palette change and Focus mode, back to the gallery', async ({ page }) => {
    const stub = await stubTryApl(page);
    await page.goto('./#/art/julia-set');
    await expect(page.getByRole('heading', { level: 1, name: 'Julia Set' })).toBeVisible();

    // 2. What the primary action looks like to begin with.
    const teal = await css(runButton(page), 'background-color');
    expect(teal).toBe(await token(page, '--ui-accent-solid'));

    // 3. And a slider and the selected card agree with it.
    await expect(page.locator('input[type="range"]').first()).toHaveCSS(
      'accent-color',
      await token(page, '--ui-accent-solid'),
    );
    await expect(page.getByRole('radio', { name: /Poolrooms/ })).toHaveCSS(
      'border-top-color',
      await token(page, '--ui-accent-border'),
    );

    await runButton(page).click();
    await expect(runStatus(page)).not.toHaveText(/Running/, { timeout: 30_000 });
    const runs = stub.requests.length;

    // 4. A different palette.
    await page.getByRole('radio', { name: /Neon/ }).click();

    // 5. Everything themed moves together, and nothing ran again.
    await expect.poll(() => css(runButton(page), 'background-color'), { timeout: 5_000 }).not.toBe(teal);
    await follows(page, runButton(page), 'background-color', '--ui-accent-solid');
    const purple = await token(page, '--ui-accent-solid');
    expect(purple).not.toBe(teal);
    await follows(page, page.locator('input[type="range"]').first(), 'accent-color', '--ui-accent-solid');
    await expect(page.getByRole('radio', { name: /Neon/ })).toHaveCSS(
      'border-top-color',
      await token(page, '--ui-accent-border'),
    );
    expect(stub.requests.length).toBe(runs);

    // 6. The controls still do what they did.
    const slider = page.locator('input[type="range"]').first();
    await slider.focus();
    const before = await slider.inputValue();
    await page.keyboard.press('ArrowRight');
    expect(await slider.inputValue()).not.toBe(before);

    // 7 and 8. Focus mode: the toolbar over the artwork uses dark variants, and
    // the drawer's own controls stay on the light tokens because the drawer is light.
    await page.getByRole('button', { name: 'Focus mode' }).click();
    const controls = page.getByRole('button', { name: 'Controls', exact: true });
    await expect(controls).toBeVisible();

    await expect(controls).toHaveAttribute('aria-expanded', 'true');
    expect(await css(controls, 'border-top-color')).toBe(await token(page, '--ui-accent-border-on-dark'));
    await follows(page, runButton(page), 'background-color', '--ui-accent-solid');
    expect(stub.requests.length).toBe(runs);

    await page.getByRole('button', { name: 'Exit focus' }).click();

    // 9 and 10. The gallery returns to APL Art's own colours.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Gallery' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Tiny programs/ })).toBeVisible();

    expect(await page.locator('[data-accent]').getAttribute('data-accent')).toBe('default');
    const current = page.locator('[aria-current="page"]');
    expect(await css(current, 'box-shadow')).toContain(await token(page, '--ui-accent-border'));
  });
});

test.describe('forced colours', () => {
  test.use({ viewport: WIDE });

  test('selection survives when the system supplies the colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openArtwork(page, 'julia-set', 'Julia Set');

    const selected = page.getByRole('radio', { name: /Poolrooms/ });
    const other = page.getByRole('radio', { name: /Forest/ });

    // The palette cannot be seen in forced colours, so what has to survive is the
    // part that was never colour: the state, and the weight that shows it.
    await expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(await heaviestWeight(selected)).toBeGreaterThan(await heaviestWeight(other));
  });
});
