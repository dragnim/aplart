/**
 * Drives the built site in a real browser and captures screenshots.
 *
 *     npm run build && npm run preview &
 *     npm run screenshot
 *     npm run screenshot -- https://dragnim.github.io/aplart/
 *
 * Used to look at the application the way a visitor does, and to produce the
 * README screenshot. It runs a real artwork through the real APL service, so
 * what is captured is the actual output rather than a mock.
 *
 * Images go to .preview/, which is not committed. Console errors are reported
 * and set a non-zero exit code.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4173/aplart/';
const OUT = '.preview';

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
}

if (errors.length > 0) {
  console.error('\nConsole errors:');
  for (const error of errors) console.error(`  ${error}`);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
