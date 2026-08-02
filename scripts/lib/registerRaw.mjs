/**
 * Registers the `?raw` loader for scripts run under `tsx`.
 *
 * Imported with `node --import`, before anything that reaches an `.apl` file.
 */

import { register } from 'node:module';

register('./rawHooks.mjs', import.meta.url);
