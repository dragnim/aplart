/**
 * Runs one preset at a chosen parameter value and prints exactly what came
 * back, including the generated expression.
 *
 *     npm run debug:preset -- mandelbrot-field size 200
 *
 * For when a preset fails at a particular setting and the friendly error is
 * not enough to say why.
 */

import { setParameterValue } from '../src/editor/parameterBinding';
import { flattenToExpression } from '../src/execution/aplSource';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { buildProbeExpression } from '../src/execution/transport';
import { getPreset } from '../src/presets/presets';

const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

async function main(): Promise<number> {
  const [presetId, variable, rawValue] = process.argv.slice(2);

  if (presetId === undefined) {
    console.error('Usage: npm run debug:preset -- <presetId> [variable] [value]');
    return 1;
  }

  const preset = getPreset(presetId);
  if (preset === undefined) {
    console.error(`No preset called "${presetId}".`);
    return 1;
  }

  let source = preset.code;
  if (variable !== undefined && rawValue !== undefined) {
    const updated = setParameterValue(source, variable, Number(rawValue));
    if (!updated.ok) {
      console.error(`"${variable}" is not a top-level assignment.`);
      return 1;
    }
    source = updated.code;
    console.log(`Set ${variable} to ${rawValue}\n`);
  }

  const flat = flattenToExpression(source);
  if (!flat.ok) {
    console.error(`Could not flatten: ${flat.message}`);
    return 1;
  }

  const service = new TryAplExecutionService({ endpoint: ENDPOINT });

  if (preset.outputLimits?.highResolution === true) {
    const probe = buildProbeExpression(flat.statements);
    console.log(`Probe: ${probe}\n`);
    const reply = await service.execute({ code: probe, timeoutMs: 30_000, freshWorkspace: true });
    console.log('Probe reply:');
    for (const line of reply.outputLines.slice(0, 8)) console.log(`  |${line}`);
    console.log();
  } else {
    console.log(`Expression: ${flat.expression}\n`);
  }

  try {
    const run = await runArtwork({
      service: new TryAplExecutionService({ endpoint: ENDPOINT }),
      source,
      highResolution: preset.outputLimits?.highResolution ?? false,
      limits: {
        maxRows: preset.outputLimits?.maxRows ?? 256,
        maxColumns: preset.outputLimits?.maxColumns ?? 256,
        maxCells: preset.outputLimits?.maxCells ?? 65_536,
      },
      timeoutMs: 30_000,
    });
    console.log(
      `OK: ${run.matrix.rows}x${run.matrix.columns}, values ${run.stats.min}..${run.stats.max}, ` +
        `${run.requestCount} request(s), ${run.durationMs}ms`,
    );
    for (const warning of run.warnings) console.log(`  warning: ${warning}`);
  } catch (error) {
    const detail = error instanceof Error && 'detail' in error ? String(error.detail) : '';
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    if (detail !== '' && detail !== 'undefined') console.error(`Detail:\n${detail}`);
    return 1;
  }

  return 0;
}

process.exit(await main());
