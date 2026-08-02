/**
 * Captures the palette editor against the real service.
 *
 * What no assertion can judge: whether the stop rows are readable, whether the
 * gradient preview matches the artwork beside it, and whether a hard edge —
 * two stops in the same place — looks deliberate rather than broken.
 *
 *     npm run build && node scripts/shoot-palette.mjs
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4186;
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
async function stops(page) {
  return (await page.getByLabel(/^Hex value of stop/).all()).length;
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

  await page.getByRole('radio', { name: /Custom/ }).click();
  await page.getByLabel(/^Hex value of stop 1/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/p1-editor-seeded.png` });
  console.log('seeded from the named ramp:', await stops(page), 'stops');

  // A palette of its own, with the stops bunched towards the dark end so the
  // fractal's edge gets most of the range.
  const chosen = [
    ['#04121f', '0'],
    ['#0d3b66', '12'],
    ['#1f7a8c', '24'],
    ['#bfd7ea', '38'],
    ['#f6511d', '62'],
    ['#ffb400', '100'],
  ];
  while ((await stops(page)) > chosen.length) {
    await page.getByRole('button', { name: `Remove stop ${String(chosen.length + 1)}` }).click();
  }
  for (const [index, [colour, position]] of chosen.entries()) {
    await page.getByLabel(`Hex value of stop ${String(index + 1)}`).fill(colour);
    await page.getByLabel(`Position of stop ${String(index + 1)}, per cent`).fill(position);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/p2-custom-applied.png` });

  // Two stops in the same place: a hard edge, which is the only way to get one.
  await page.getByLabel('Position of stop 5, per cent').fill('62');
  await page.getByLabel('Position of stop 4, per cent').fill('62');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/p3-hard-edge.png` });

  // And in Focus mode, where the same panel is in the drawer.
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.waitForTimeout(600);
  await page.getByLabel(/^Hex value of stop 1/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/p4-focus-editor.png` });

  console.log('captured');
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length > 0 ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (errors.length > 0) process.exitCode = 1;
