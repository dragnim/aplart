/**
 * Fails the build if any preset is malformed.
 *
 * The application drops a bad preset and carries on, which is right for a
 * visitor but wrong for CI — a preset that never reaches the gallery is a bug
 * that should stop the pipeline.
 *
 *     npm run validate:presets
 */

import { presetIssues, presets } from '../src/presets/presets';

function main(): number {
  if (presetIssues.length > 0) {
    console.error(`${presetIssues.length} preset problem(s) found:\n`);
    for (const issue of presetIssues) {
      console.error(`  ${issue.presetId}: ${issue.message}`);
    }
    return 1;
  }

  console.log(`${presets.length} preset(s) validated successfully.`);
  for (const preset of presets) {
    const parameters = preset.parameters.length;
    console.log(`  ${preset.id.padEnd(22)} ${preset.category.padEnd(10)} ${parameters} parameter(s)`);
  }
  return 0;
}

process.exit(main());
