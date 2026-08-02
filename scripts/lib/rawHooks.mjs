/**
 * Teaches Node's loader the `?raw` import Vite already understands.
 *
 * The application reads each artwork's APL out of a tracked `.apl` file with
 * `import source from './apl/id.apl?raw'`. Vite resolves that when it builds
 * the site and when Vitest runs, but the developer scripts run under `tsx`,
 * which is esbuild and has never heard of the suffix — so validating presets or
 * refreshing a fixture would fail on an extension it cannot load.
 *
 * Rather than keep a second copy of the APL for the scripts to read, the
 * scripts are taught the same import. This deliberately implements only the one
 * feature: a `?raw` suffix yields the file's text as the default export.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RAW = /\?raw$/u;

/** @type {import('node:module').ResolveHook} */
export const resolve = async (specifier, context, next) => {
  if (!RAW.test(specifier)) return next(specifier, context);

  // Resolved without the suffix, because nothing else knows what it means, and
  // then put back so `load` can recognise the module as a raw one.
  const resolved = await next(specifier.replace(RAW, ''), context);
  return { ...resolved, url: `${resolved.url}?raw`, shortCircuit: true };
};

/** @type {import('node:module').LoadHook} */
export const load = async (url, context, next) => {
  if (!RAW.test(url)) return next(url, context);

  const text = await readFile(fileURLToPath(url.replace(RAW, '')), 'utf8');
  return {
    format: 'module',
    shortCircuit: true,
    source: `export default ${JSON.stringify(text)};`,
  };
};
