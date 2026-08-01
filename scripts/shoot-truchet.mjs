/**
 * Captures the Truchet tiling as the application actually exports it.
 *
 * The variant montages are rendered in Node at one pixel per motif pixel. What
 * they cannot show is the export path, which scales the rasterised tiling down
 * to a requested size with the browser's own smoothing — and a downscale is
 * exactly where a thin arc and a thin diagonal can stop matching each other.
 *
 *     npm run build && node scripts/shoot-truchet.mjs
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4184;
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

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}#/art/truchet-grid`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content');

  for (const shapes of [2, 4]) {
    // Set the tile shapes through the control, so the code is rewritten the way
    // a person would have done it.
    const slider = page.getByLabel('Tile shapes');
    await slider.fill(String(shapes));
    await page.getByRole('button', { name: /^Run/ }).click();
    await waitForRun(page);

    await page.screenshot({ path: `${OUT}/t${String(shapes)}-on-screen.png` });

    for (const size of ['512 × 512', 'Original size']) {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: size }).click();
      const file = size.startsWith('512')
        ? `t${String(shapes)}-export-512.png`
        : `t${String(shapes)}-export-original.png`;
      await (await download).saveAs(`${OUT}/${file}`);
      console.log(`shapes ${String(shapes)}: ${size} -> ${file}`);
    }
  }

  console.log('captured');
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length > 0 ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (errors.length > 0) process.exitCode = 1;
