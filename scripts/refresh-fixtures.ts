/**
 * Regenerates preset fixtures from the real APL service.
 *
 *     npm run refresh:fixtures            # every preset
 *     npm run refresh:fixtures -- bloom   # only presets whose id contains "bloom"
 *
 * This is deliberately a manual step. A build that silently refreshed fixtures
 * would destroy their whole purpose, which is to notice when a preset's output
 * changes without anyone intending it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TryAplExecutionService } from '../src/execution/TryAplExecutionService';
import { runArtwork } from '../src/execution/runArtwork';
import { toNested } from '../src/matrix/matrixTypes';
import { hashCode, type PresetFixture } from '../src/presets/fixtures';
import { presets } from '../src/presets/presets';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.VITE_APL_EXEC_ENDPOINT ?? 'https://tryapl.org/Exec';

const LIMITS = { maxRows: 256, maxColumns: 256, maxCells: 65_536 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const filter = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
  const selected = presets.filter(
    (preset) => filter.length === 0 || filter.some((term) => preset.id.includes(term)),
  );

  if (selected.length === 0) {
    console.error('No presets matched.');
    return 1;
  }

  console.log(`Refreshing ${selected.length} fixture(s) from ${ENDPOINT}\n`);
  let failures = 0;

  for (const preset of selected) {
    process.stdout.write(`  ${preset.id.padEnd(22)} `);

    try {
      const run = await runArtwork({
        service: new TryAplExecutionService({ endpoint: ENDPOINT }),
        source: preset.code,
        limits: LIMITS,
        timeoutMs: 30_000,
      });

      const fixture: PresetFixture = {
        presetId: preset.id,
        codeHash: hashCode(preset.code),
        rows: run.matrix.rows,
        columns: run.matrix.columns,
        values: toNested(run.matrix),
        generatedAt: new Date().toISOString(),
      };

      const path = join(REPO_ROOT, preset.fixturePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

      console.log(
        `${run.matrix.rows}x${run.matrix.columns}, ` +
          `values ${run.stats.min}..${run.stats.max}, ` +
          `${run.requestCount} request(s), ${run.durationMs}ms`,
      );
    } catch (error) {
      failures += 1;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }

    // The endpoint is a shared public service; do not hammer it.
    await sleep(800);
  }

  console.log(failures === 0 ? '\nAll fixtures refreshed.' : `\n${failures} preset(s) failed.`);
  return failures === 0 ? 0 : 1;
}

process.exit(await main());
