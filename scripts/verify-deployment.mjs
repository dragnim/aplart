/**
 * Checks the deployed site against the acceptance criteria that can only be
 * verified in production.
 *
 *     npm run verify:deployment
 *     npm run verify:deployment -- https://dragnim.github.io/aplart/
 *
 * Everything here is something the test suites cannot see, because it depends
 * on the real deployment: the base path resolving under a subdirectory, hash
 * routes surviving a direct visit with no server rewrites, the committed
 * thumbnails actually being published, and a real browser at the real origin
 * being allowed to reach the APL service and draw a picture from it.
 *
 * Exits non-zero on any failure, so it can gate a release.
 */

import { chromium } from '@playwright/test';

const SITE = (process.argv[2] ?? 'https://dragnim.github.io/aplart/').replace(/\/?$/u, '/');

const results = [];
let failures = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const failedRequests = [];
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? ''}`);
  });

  // --- The gallery loads from a subpath ---
  const response = await page.goto(SITE, { waitUntil: 'networkidle' });
  record('the site responds', response?.ok() === true, `HTTP ${response?.status() ?? 'none'}`);

  const cards = await page.getByRole('article').count();
  record('at least six artworks are shown', cards >= 6, `${cards} cards`);

  // --- Every thumbnail published and loading ---
  const images = page.locator('article img');
  const imageCount = await images.count();
  let loaded = 0;
  for (let index = 0; index < imageCount; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    const ok = await image.evaluate((element) => {
      const img = element;
      return img.complete && img.naturalWidth > 0;
    });
    if (ok) loaded += 1;
  }
  record('every thumbnail loads', loaded === imageCount, `${loaded}/${imageCount}`);

  // --- Assets resolve under the base path ---
  record('no failed requests', failedRequests.length === 0, failedRequests.join('; '));

  /*
   * A hash route opened cold, with no server rewrite.
   *
   * In a fresh page, so it is a real document load. Navigating by hash from an
   * already-open page is a same-document navigation and returns no response at
   * all, which proves nothing about what GitHub Pages serves.
   */
  const deepPage = await browser.newPage();
  const deep = await deepPage.goto(`${SITE}#/about`, { waitUntil: 'networkidle' });
  const heading = await deepPage.getByRole('heading', { level: 1 }).innerText();
  record(
    'a deep hash route works on a cold direct visit',
    deep?.ok() === true && heading.includes('About'),
    `HTTP ${deep?.status() ?? 'none'}, heading "${heading}"`,
  );
  await deepPage.close();

  // --- APL actually runs, from this origin, and draws something ---
  await page.goto(`${SITE}#/art/modular-bloom`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content', { timeout: 30_000 });

  await page.getByRole('button', { name: /^Run/ }).click();
  const status = page.locator('[role="status"][data-status]');
  await status.waitFor();

  let finished = '';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    finished = (await status.innerText()).trim();
    if (!/Running/.test(finished) && finished !== '') break;
    await page.waitForTimeout(500);
  }
  record('APL runs on the live site', /Finished in/.test(finished), finished);

  const description = await page.getByRole('img').getAttribute('aria-label');
  record(
    'the artwork was drawn and described',
    description !== null && /\d+ by \d+ grid/u.test(description),
    description ?? 'no description',
  );

  // --- The high-resolution preset, which needs several requests ---
  await page.goto(`${SITE}#/art/mandelbrot-field`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-content', { timeout: 30_000 });
  await page.getByRole('button', { name: /^Run/ }).click();

  let banded = '';
  for (let attempt = 0; attempt < 90; attempt += 1) {
    banded = (await page.locator('[role="status"][data-status]').innerText()).trim();
    if (!/Running/.test(banded) && banded !== '') break;
    await page.waitForTimeout(500);
  }
  record('the banded high-resolution preset runs', /Finished in/.test(banded), banded);

  // --- Nothing broken in the console ---
  record('no console errors', consoleErrors.length === 0, consoleErrors.join('; '));
} finally {
  await browser.close();
}

console.log(`\nDeployment check: ${SITE}\n`);
for (const { name, ok, detail } of results) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  — ${detail}`}`);
}
console.log(failures === 0 ? '\nAll deployment checks passed.' : `\n${failures} deployment check(s) failed.`);

process.exitCode = failures === 0 ? 0 : 1;
