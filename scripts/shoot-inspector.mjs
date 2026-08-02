/**
 * Captures the value inspector against the real service.
 *
 * Three things no assertion can judge: whether the panel is readable over an
 * arbitrary artwork, whether the marker can actually be found on the cell it
 * names, and whether the flat-view notice reads as information rather than as an
 * error report.
 *
 *     npm run build && node scripts/shoot-inspector.mjs
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4185;
const BASE = `http://localhost:${PORT}/aplart/`;
const OUT = '.preview';

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

for (;;) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];

/** @param {import('@playwright/test').Page} page */
async function waitForRun(page) {
  await page.waitForFunction(
    () =>
      /Finished|could not|did not/.test(
        document.querySelector('[role="status"][data-status]')?.textContent ?? '',
      ),
    undefined,
    { timeout: 60_000 },
  );
}

/** @param {import('@playwright/test').Page} page */
async function pressAt(page, u, v) {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('the canvas is not on screen');
  await page.mouse.click(box.x + box.width * u, box.y + box.height * v);
}

/** @param {import('@playwright/test').Page} page */
async function reading(page) {
  // Found by what it says, not by its class. CSS module names are hashed, so a
  // component-name selector matches nothing and reports "(none)" — which reads
  // as the feature being broken rather than the query being wrong.
  const panel = page
    .locator('[role="status"]')
    .filter({ hasText: /Row \d+, column \d+|Every point in this view/u })
    .first();
  return (await panel.count()) === 0 ? '(none)' : (await panel.innerText()).replaceAll('\n', ' | ');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  // --- A cell on the fractal's edge, where the counts are varied ---
  await page.goto(`${BASE}#/art/mandelbrot-field`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content');
  await page.getByRole('button', { name: /^Run/ }).click();
  await waitForRun(page);

  await pressAt(page, 0.36, 0.3);
  await page.screenshot({ path: `${OUT}/i1-cell-on-the-edge.png` });
  console.log('edge cell:', await reading(page));

  // --- A cell inside the set, which is at the iteration ceiling ---
  await pressAt(page, 0.6, 0.5);
  await page.screenshot({ path: `${OUT}/i2-cell-at-the-ceiling.png` });
  console.log('interior cell:', await reading(page));

  // --- A view entirely inside the set: one flat colour, and the notice ---
  // `exact`, because the inspector controls also offer "Clear selection".
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page
    .locator('.cm-content')
    .fill(
      [
        '⍝ Controls',
        'size←128',
        'iterations←28',
        'centreX←¯0.4',
        'centreY←0',
        'zoom←0.08',
        '',
        'ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1',
        'cr←(size,size)⍴ax',
        'ci←⍉(size,size)⍴ay',
        '',
        'step←{(zr zi n)←⍵ ⋄ m←4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)(n+m)}',
        '⊃⌽step⍣iterations⊢(cr×0)(ci×0)(cr×0)',
      ].join('\n'),
    );
  await page.getByRole('button', { name: /^Run/ }).click();
  await waitForRun(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/i3-flat-view-notice.png` });
  console.log('flat view:', await reading(page));

  // --- The same in Focus mode, over a letterboxed artwork ---
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.waitForTimeout(600);
  await pressAt(page, 0.5, 0.4);
  await page.screenshot({ path: `${OUT}/i4-focus-reading.png` });
  console.log('in focus:', await reading(page));

  // --- The route that needs no pointer ---
  const keyboard = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  keyboard.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[keyboard] ${m.text()}`);
  });
  await keyboard.goto(`${BASE}#/art/mandelbrot-field`, { waitUntil: 'networkidle' });
  await keyboard.waitForSelector('.cm-content');
  await keyboard.getByRole('button', { name: /^Run/ }).click();
  await waitForRun(keyboard);

  await keyboard.getByLabel(/^Row/).fill('40');
  await keyboard.getByLabel(/^Column/).fill('52');
  await keyboard.getByRole('button', { name: 'Inspect' }).click();
  await keyboard.getByRole('button', { name: 'Next cell' }).click();
  await keyboard.getByRole('button', { name: 'Next cell' }).click();
  await keyboard.getByLabel(/^Row/).scrollIntoViewIfNeeded();
  await keyboard.screenshot({ path: `${OUT}/i6-without-a-pointer.png` });
  console.log('by keyboard:', await reading(keyboard));

  // --- A tiling, where a cell is a tile rather than a pixel ---
  const tiles = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  tiles.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[tiles] ${m.text()}`);
  });
  await tiles.goto(`${BASE}#/art/truchet-grid`, { waitUntil: 'networkidle' });
  await tiles.waitForSelector('.cm-content');
  await tiles.getByRole('button', { name: /^Run/ }).click();
  await waitForRun(tiles);
  await pressAt(tiles, 0.42, 0.38);
  await tiles.screenshot({ path: `${OUT}/i5-tile-reading.png` });
  console.log('tile:', await reading(tiles));

  console.log('captured');
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length > 0 ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (errors.length > 0) process.exitCode = 1;
