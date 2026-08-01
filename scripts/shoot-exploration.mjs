/**
 * Captures a real zoom into the Mandelbrot set.
 *
 * Deliberately not stubbed: this runs against TryAPL, so the pictures are the
 * ones the APL actually produces. The thing worth looking at is whether the
 * region dragged is the region arrived at, which no assertion can tell me.
 *
 *     npm run build && node scripts/shoot-exploration.mjs
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4183;
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
async function canvasBox(page) {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('the canvas is not on screen');
  return box;
}

/**
 * Reads the three view assignments out of the editor.
 *
 * @param {import('@playwright/test').Page} page
 */
async function view(page) {
  const text = await page.locator('.cm-content').innerText();
  const read = (name) => new RegExp(`${name}←(¯?[\\d.]+)`, 'u').exec(text)?.[1] ?? '?';
  return `centreX←${read('centreX')} centreY←${read('centreY')} zoom←${read('zoom')}`;
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}#/art/mandelbrot-field`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content');
  await page.getByRole('button', { name: /^Run/ }).click();
  await waitForRun(page);
  await page.screenshot({ path: `${OUT}/x1-before.png` });
  console.log('start:', await view(page));

  // Held mid-drag, to see the region marker over the artwork.
  const box = await canvasBox(page);
  const at = (u, v) => ({ x: box.x + box.width * u, y: box.y + box.height * v });
  const from = at(0.3, 0.34);
  const to = at(0.52, 0.56);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.screenshot({ path: `${OUT}/x2-dragging.png` });

  await page.mouse.up();
  await waitForRun(page);
  await page.screenshot({ path: `${OUT}/x3-zoomed.png` });
  console.log('after one drag:', await view(page));

  /*
   * Again, deeper, onto the boundary rather than into the middle.
   *
   * Aiming at the interior is what an unwary first attempt does, and it looks
   * like a bug: the inside of the set is a single value by definition, so a
   * zoom into it is a flat field of one colour. The detail is all on the edge.
   */
  const second = await canvasBox(page);
  const at2 = (u, v) => ({ x: second.x + second.width * u, y: second.y + second.height * v });
  await page.mouse.move(at2(0.54, 0.2).x, at2(0.54, 0.2).y);
  await page.mouse.down();
  await page.mouse.move(at2(0.72, 0.38).x, at2(0.72, 0.38).y);
  await page.mouse.up();
  await waitForRun(page);
  await page.screenshot({ path: `${OUT}/x4-deeper.png` });
  console.log('after two drags:', await view(page));

  // And the way back.
  await page.getByRole('button', { name: /^Back/ }).click();
  await waitForRun(page);
  console.log('after Back:', await view(page));

  // The view controls themselves, which are also the only route without a
  // pointer, so their labels and grouping matter.
  await page.getByRole('button', { name: 'Pan left' }).scrollIntoViewIfNeeded();
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Code controls' }) })
    .screenshot({ path: `${OUT}/x7-view-controls.png` });

  // Focus mode, where the artwork is large enough to aim at properly.
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.waitForTimeout(600);
  const focused = await canvasBox(page);
  const at3 = (u, v) => ({ x: focused.x + focused.width * u, y: focused.y + focused.height * v });
  await page.mouse.move(at3(0.28, 0.12).x, at3(0.28, 0.12).y);
  await page.mouse.down();
  await page.mouse.move(at3(0.46, 0.3).x, at3(0.46, 0.3).y);
  await page.screenshot({ path: `${OUT}/x5-focus-dragging.png` });
  await page.mouse.up();
  await waitForRun(page);
  await page.screenshot({ path: `${OUT}/x6-focus-zoomed.png` });
  console.log('after focus drag:', await view(page));

  console.log('captured');
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length > 0 ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (errors.length > 0) process.exitCode = 1;
