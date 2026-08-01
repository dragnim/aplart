/**
 * Captures Focus mode at desktop and phone widths.
 *
 * A separate script from `screenshot` because Focus mode has to be entered and
 * driven, and because the thing worth checking is whether the artwork actually
 * dominates — which no assertion can tell me.
 *
 *     npm run build && node scripts/shoot-focus.mjs
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4182;
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

async function runArtwork(page) {
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.waitForFunction(
    () =>
      /Finished|could not|did not/.test(
        document.querySelector('[role="status"][data-status]')?.textContent ?? '',
      ),
    undefined,
    { timeout: 30_000 },
  );
}

try {
  // --- Desktop ---
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[desktop] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[desktop] ${e.message}`));

  await page.goto(`${BASE}#/art/truchet-grid`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content');
  await runArtwork(page);

  await page.getByRole('button', { name: 'Focus mode' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/f1-desktop-drawer-open.png` });

  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/f2-desktop-drawer-closed.png` });

  // --- A refused fullscreen request ---
  //
  // The one state of the fullscreen button that cannot be reached by driving
  // the interface, and the one whose layout in the bar is worth looking at.
  const refused = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  refused.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[refused] ${m.text()}`);
  });
  await refused.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('blocked'));
  });
  await refused.goto(`${BASE}#/art/truchet-grid`, { waitUntil: 'networkidle' });
  await refused.waitForSelector('.cm-content');
  await runArtwork(refused);
  await refused.getByRole('button', { name: 'Focus mode' }).click();
  await refused.getByRole('button', { name: 'Controls', exact: true }).click();
  // The drawer slides out; capturing mid-transition tells me nothing.
  await refused.waitForTimeout(600);
  await refused.getByRole('button', { name: 'Fullscreen' }).click();
  await refused.getByText(/Focus mode still fills the window/).waitFor();
  await refused.screenshot({ path: `${OUT}/f5-desktop-fullscreen-refused.png` });

  // --- Phone ---
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[phone] ${m.text()}`);
  });
  phone.on('pageerror', (e) => errors.push(`[phone] ${e.message}`));

  await phone.goto(`${BASE}#/art/mandelbrot-field`, { waitUntil: 'networkidle' });
  await phone.getByRole('tab', { name: 'Code' }).click();
  await phone.waitForSelector('.cm-content');
  await runArtwork(phone);

  await phone.getByRole('button', { name: 'Focus mode' }).click();
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: `${OUT}/f3-phone-sheet-open.png` });

  // `exact` matters: role-name matching is substring by default, and the
  // symbol palette contains Enclose and Disclose.
  await phone.getByRole('button', { name: 'Close', exact: true }).click();
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: `${OUT}/f4-phone-sheet-closed.png` });

  console.log('captured');
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length > 0 ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (errors.length > 0) process.exitCode = 1;
