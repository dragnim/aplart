/**
 * Repeating the artwork across the viewport.
 *
 * A preview and only a preview. It draws the finished artwork more than once;
 * it does not run the APL, touch the matrix, or make the edges join. Those are
 * three different claims and the wording here is careful to make only the one
 * that is true — a repeated pattern is not a tileable one, and the difference
 * is the whole point of keeping this separate from anything computational.
 */

import { TILE_COUNTS, TILE_SCALES, type TilingMode, type TilingView } from '@/renderer/tiling';
import { describeEdge, edgeCheckCaveat, type EdgeCheck } from '@/renderer/edgeCheck';
import styles from './TilingControls.module.css';

interface Props {
  readonly tiling: TilingView;
  readonly edges: EdgeCheck | null;
  readonly onChange: (tiling: TilingView) => void;
}

const MODE_LABELS: Record<TilingMode, string> = {
  single: 'Single',
  repeat: 'Repeat',
  'mirror-repeat': 'Mirror repeat',
};

export function TilingControls({ tiling, edges, onChange }: Props) {
  const repeating = tiling.mode !== 'single';

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Tiling</legend>

      <div className={styles.field}>
        <span className={styles.label} id="tiling-view-label">
          View
        </span>
        <div className={styles.modes} role="radiogroup" aria-labelledby="tiling-view-label">
          {(Object.keys(MODE_LABELS) as TilingMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={tiling.mode === mode}
              className={styles.mode}
              data-selected={tiling.mode === mode ? 'true' : undefined}
              onClick={() => onChange({ ...tiling, mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/*
        Offered only while something is being repeated. A count that changes
        nothing is a control that appears broken.
      */}
      {repeating && (
        <div className={styles.field}>
          <span className={styles.label} id="tiling-preview-label">
            Preview
          </span>
          <div className={styles.modes} role="radiogroup" aria-labelledby="tiling-preview-label">
            {TILE_COUNTS.map((count) => {
              const selected = tiling.columns === count && tiling.rows === count;
              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${String(count)} by ${String(count)}`}
                  className={styles.mode}
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => onChange({ ...tiling, columns: count, rows: count })}
                >
                  {count} × {count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {repeating && (
        <div className={styles.field}>
          <span className={styles.label} id="tiling-scale-label">
            Tile scale
          </span>
          <div className={styles.modes} role="radiogroup" aria-labelledby="tiling-scale-label">
            {TILE_SCALES.map((scale) => {
              const percent = Math.round(scale * 100);
              return (
                <button
                  key={scale}
                  type="button"
                  role="radio"
                  aria-checked={tiling.scale === scale}
                  className={styles.mode}
                  data-selected={tiling.scale === scale ? 'true' : undefined}
                  onClick={() => onChange({ ...tiling, scale })}
                >
                  {percent}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {repeating && (
        <p className={styles.note}>
          {tiling.mode === 'mirror-repeat'
            ? 'Alternate copies are reflected so neighbours meet along a shared edge. The artwork is unchanged and its own edges still do not join — the reflection hides the join rather than making one.'
            : 'A preview of how the artwork repeats. It draws the same result again and does not change the calculation, so the edges join only where the artwork already makes them join.'}
        </p>
      )}

      {/*
        Both controls change how many copies are on screen, which is confusing
        unless it is said plainly: the count sets how many span the artwork at
        full size, and the scale resizes them within that same area.
      */}
      {/*
        Offered only where there is a join to look at. In Single mode there are
        no boundaries between copies, so a guide would have nothing to mark.
      */}
      {repeating && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={tiling.showSeamGuides}
            onChange={(event) => onChange({ ...tiling, showSeamGuides: event.target.checked })}
          />
          <span>
            Show seam guides <span className={styles.hint}>Lines on the joins, for inspection only.</span>
          </span>
        </label>
      )}

      {repeating && (
        <p className={styles.note}>
          The preview count sets how many copies span the artwork at 100%. A smaller tile scale fits more
          copies into the same area and a larger one fits fewer, trimming whatever runs past the edge.
        </p>
      )}

      {/*
        Named for what it does. "Seamlessness test" would promise a proof this
        cannot give: it is a look at rendered pixels, and the caveat below says
        so every time rather than once in a help page nobody opens.
      */}
      {edges !== null && (
        <div className={styles.field}>
          <span className={styles.label}>Edge check</span>
          <p className={styles.reading} data-verdict={edges.horizontal.verdict}>
            {describeEdge('horizontal', edges.horizontal)}
          </p>
          <p className={styles.reading} data-verdict={edges.vertical.verdict}>
            {describeEdge('vertical', edges.vertical)}
          </p>
          <p className={styles.note}>{edgeCheckCaveat(edges.basis)}</p>
        </div>
      )}
    </fieldset>
  );
}
