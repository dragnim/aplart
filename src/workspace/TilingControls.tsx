/**
 * Repeating the artwork across the viewport.
 *
 * A preview and only a preview. It draws the finished artwork more than once;
 * it does not run the APL, touch the matrix, or make the edges join. Those are
 * three different claims and the wording here is careful to make only the one
 * that is true — a repeated pattern is not a tileable one, and the difference
 * is the whole point of keeping this separate from anything computational.
 */

import { TILE_COUNTS, type TilingMode, type TilingView } from '@/renderer/tiling';
import styles from './TilingControls.module.css';

interface Props {
  readonly tiling: TilingView;
  readonly onChange: (tiling: TilingView) => void;
}

const MODE_LABELS: Record<TilingMode, string> = {
  single: 'Single',
  repeat: 'Repeat',
};

export function TilingControls({ tiling, onChange }: Props) {
  const repeating = tiling.mode === 'repeat';

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
        <p className={styles.note}>
          A preview of how the artwork repeats. It draws the same result again and does not change the
          calculation, so the edges join only where the artwork already makes them join.
        </p>
      )}
    </fieldset>
  );
}
