/**
 * Drives the built site in a real browser and captures screenshots.
 *
 *     npm run build && npm run screenshot
 *     npm run screenshot -- https://dragnim.github.io/aplart/
 *
 * Used to look at the application the way a visitor does, and to produce the
 * README screenshots. It runs a real artwork through the real APL service, so
 * what is captured is the actual output rather than a mock.
 *
 * With no argument it starts its own preview server on a port of its own and
 * shuts it down afterwards. That is deliberate: leaving a hand-started server
 * on Playwright's port made the end-to-end suite refuse to start, repeatedly.
 *
 * Images go to .preview/, which is not committed. Console errors are reported
 * and set a non-zero exit code.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/** Deliberately not Playwright's 4173. */
const PORT = 4180;
const BASE = process.argv[2] ?? `http://localhost:${PORT}/aplart/`;
const OUT = '.preview';

/** Started only when pointing at localhost; a remote URL needs no server. */
let server = null;

if (process.argv[2] === undefined) {
  server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' },
  );

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const probe = await fetch(BASE);
      if (probe.ok) break;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      server.kill();
      throw new Error(`The preview server did not start on port ${PORT}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${label}] ${error.message}`));
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  watch(page, 'desktop');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/1-gallery.png` });
  console.log('gallery');

  await page.getByRole('link', { name: /^Open/ }).first().click();
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/2-workspace.png` });
  console.log('workspace');

  await page.getByRole('button', { name: /^Run/ }).click();
  await page.waitForFunction(
    () => !/Running/.test(document.querySelector('[role="status"][data-status]')?.textContent ?? 'Running'),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-after-run.png` });
  console.log('after run:', (await page.locator('[role="status"][data-status]').innerText()).trim());

  // Change a parameter and confirm the code moves with it.
  const before = await page.locator('.cm-content').innerText();
  const modulus = page.locator('input[type="range"]').nth(1);
  await modulus.focus();
  for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const after = await page.locator('.cm-content').innerText();
  console.log('slider rewrote the code:', before !== after);

  await page.getByRole('button', { name: /^Run/ }).click();
  await page.waitForFunction(
    () => !/Running/.test(document.querySelector('[role="status"][data-status]')?.textContent ?? 'Running'),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/4-after-slider.png` });
  console.log('after slider');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(mobile, 'mobile');
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: `${OUT}/5-mobile-gallery.png`, fullPage: false });
  await mobile.getByRole('link', { name: /^Open/ }).first().click();
  await mobile.getByRole('tab', { name: 'Code' }).click();
  await mobile.waitForSelector('.cm-content', { timeout: 15_000 });
  await mobile.screenshot({ path: `${OUT}/6-mobile-workspace.png` });
  console.log('mobile');
} finally {
  await browser.close();
  server?.kill();
}

if (errors.length > 0) {
  console.error('\nConsole errors:');
  for (const error of errors) console.error(`  ${error}`);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
