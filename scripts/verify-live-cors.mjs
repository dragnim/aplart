/**
 * Confirms that a real browser, at the deployed origin, can call the APL
 * execution endpoint.
 *
 * This cannot be checked with curl. CORS is enforced by the browser, not the
 * server: curl happily reads a response that a page would be forbidden to see.
 * It also cannot be checked from localhost, because the origin is what is
 * being tested. So it runs Chromium against the real deployed site.
 *
 *     node scripts/verify-live-cors.mjs [siteUrl] [endpoint]
 *
 * Exits non-zero if the request is blocked, so it can gate a release.
 */

import { chromium } from '@playwright/test';

const SITE_URL = process.argv[2] ?? 'https://dragnim.github.io/aplart/';
const ENDPOINT = process.argv[3] ?? 'https://tryapl.org/Exec';

const browser = await chromium.launch();

try {
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  console.log(`Site     : ${SITE_URL}`);
  console.log(`Endpoint : ${ENDPOINT}\n`);

  const response = await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  if (response === null || !response.ok()) {
    console.error(`The site did not load (HTTP ${response?.status() ?? 'no response'}).`);
    process.exitCode = 1;
  } else {
    console.log(`Site loaded: HTTP ${response.status()}, title "${await page.title()}"`);
  }

  const result = await page.evaluate(async (endpoint) => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(['', 0, '', '3 3⍴⍳9']),
      });
      // The response comes from an external service, so nothing about its
      // shape is assumed until it has been checked.
      const body = /** @type {unknown[]} */ (await res.json());
      const lines = body[3];
      return {
        ok: true,
        status: res.status,
        output: Array.isArray(lines) ? lines.map((line) => String(line)) : [],
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }, ENDPOINT);

  console.log('\nCross-origin execution request from the deployed origin:');

  if (!result.ok) {
    console.error(`  BLOCKED — ${result.error}`);
    console.error('\nThe browser refused the request. Either have the origin permitted on the');
    console.error('backend, or point VITE_APL_EXEC_ENDPOINT at a proxy that sets the headers.');
    process.exitCode = 1;
  } else {
    const expected = ['1 2 3', '4 5 6', '7 8 9'];
    const actual = Array.isArray(result.output) ? result.output.map((line) => line.trim()) : [];
    const matches = expected.every((line, index) => actual[index] === line);

    console.log(`  ALLOWED — HTTP ${result.status}`);
    for (const line of actual) console.log(`    | ${line}`);

    if (!matches) {
      console.error('\n  The response did not contain the expected 3x3 matrix. The protocol may');
      console.error('  have changed; check TryAplExecutionService against the live service.');
      process.exitCode = 1;
    }
  }

  if (consoleErrors.length > 0) {
    console.error('\nConsole errors on the deployed page:');
    for (const message of consoleErrors) console.error(`  ${message}`);
    process.exitCode = 1;
  } else {
    console.log('\nNo console errors on the deployed page.');
  }
} finally {
  await browser.close();
}
