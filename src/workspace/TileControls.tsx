/**
 * Tile: can I use this as a repeating background?
 *
 * The tab answers one question and keeps two things apart while it does.
 *
 * Whether the *artwork* is seamless is a fact about the program and the numbers
 * it holds, computed in `tileability.ts` from the source alone. Whether copies
 * of it are being drawn side by side — Repeat, Mirror repeat, how many, how
 * large — is a way of looking at a finished tile. Mirror repeat in particular
 * makes a join vanish by reflecting one side onto the other, so it can never be
 * allowed to change the verdict; here it cannot, because the verdict never sees
 * it.
 */

import { type PaintSignal } from './paintSignal';
import { type TileVerdict } from '@/presets/tileability';
import { TILE_COUNTS, TILE_SCALES, type TilingMode, type TilingView } from '@/renderer/tiling';
import { TilePreview, type TileSource } from './TilePreview';
import styles from './TileControls.module.css';

interface Props {
  readonly verdict: TileVerdict;
  /** What the artwork can promise at its best, in the visitor's words. */
  readonly summary: string;
  readonly tiling: TilingView;
  readonly onChange: (tiling: TilingView) => void;
  /** Applies the correction the verdict describes, as one undoable redraw. */
  readonly onCorrect: () => void;
  /** The artwork as it stands, which the preview renders for itself. */
  readonly source: TileSource;
  /** Repaint announcements, which the preview needs only while a palette animates. */
  readonly painted: PaintSignal;
}

const MODES: Record<TilingMode, string> = {
  single: 'Single',
  repeat: 'Repeat',
  'mirror-repeat': 'Mirror repeat',
};

const STATE_WORDS = {
  seamless: 'Seamless',
  correctable: 'Can be made seamless',
  none: 'Not seamless',
} as const;

export function TileControls({ verdict, summary, tiling, onChange, onCorrect, source, painted }: Props) {
  return (
    <div className={styles.panel}>
      {/*
        The answer first, in three words rather than in arithmetic. "Repeats
        every twenty-four cells" is true and is not what somebody wanting a
        background needs to know.
      */}
      {/*
        No edge check here, deliberately.

        It compares the tile's left column against its right, which is one way to
        tile and not the way any of these artworks does it. A pattern with a
        period of twenty-four in a grid of ninety-six joins column 95 to column 0
        of the next copy — adjacent phases of the cycle, not equal ones — so the
        comparison reports a mismatch for an artwork that tiles perfectly.
        Measured on every one of them: "edges do not match" underneath a green
        Seamless, which is worse than silence. It stays in Advanced, where it
        describes artworks whose repetition is composition rather than
        construction.
      */}
      <div className={styles.verdict} data-state={verdict.state}>
        <p className={styles.state}>{STATE_WORDS[verdict.state]}</p>
        <p className={styles.summary}>{summary}</p>

        {verdict.correctionLabel !== null && (
          <button type="button" className={styles.correct} onClick={onCorrect}>
            {verdict.correctionLabel}
          </button>
        )}
      </div>

      {/*
        Three by three, because a join runs in both directions and a single
        boundary shows only one of them. It renders one plain copy of the artwork
        through the shared renderer and places it nine times — no run, no change
        to the artwork, and no dependence on which composition is on screen.
      */}
      <div className={styles.field}>
        <span className={styles.label} id="tile-preview-label">
          How it repeats
        </span>
        <TilePreview {...source} painted={painted} labelledBy="tile-preview-label" />
        <p className={styles.note}>
          Ordinary repeat, so the joins are the artwork&rsquo;s own. The middle of the preview is where four
          copies meet.
        </p>
      </div>

      {/*
        And how the artwork itself is shown, which is a different question from
        whether it tiles. These moved here from Advanced, where they sat among
        the exact numbers and were about the picture rather than the program.
      */}
      <div className={styles.field}>
        <span className={styles.label} id="tile-view-label">
          Show the artwork as
        </span>
        <div className={styles.modes} role="radiogroup" aria-labelledby="tile-view-label">
          {(Object.keys(MODES) as TilingMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={tiling.mode === mode}
              className={styles.mode}
              data-selected={tiling.mode === mode ? 'true' : undefined}
              onClick={() => onChange({ ...tiling, mode })}
            >
              {MODES[mode]}
            </button>
          ))}
        </div>
      </div>

      {tiling.mode !== 'single' && (
        <>
          <div className={styles.field}>
            <span className={styles.label} id="tile-count-label">
              Copies
            </span>
            <div className={styles.modes} role="radiogroup" aria-labelledby="tile-count-label">
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

          <div className={styles.field}>
            <span className={styles.label} id="tile-scale-label">
              Tile scale
            </span>
            <div className={styles.modes} role="radiogroup" aria-labelledby="tile-scale-label">
              {TILE_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  role="radio"
                  aria-checked={tiling.scale === scale}
                  className={styles.mode}
                  data-selected={tiling.scale === scale ? 'true' : undefined}
                  onClick={() => onChange({ ...tiling, scale })}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={tiling.showSeamGuides}
              onChange={(event) => onChange({ ...tiling, showSeamGuides: event.target.checked })}
            />
            Mark where the copies meet
          </label>

          {tiling.mode === 'mirror-repeat' && (
            <p className={styles.note}>
              Alternate copies are reflected so neighbours meet along a shared edge. The artwork is unchanged
              and its own edges still do not join &mdash; the reflection hides the join rather than making
              one, which is why it never changes the answer above.
            </p>
          )}
        </>
      )}
    </div>
  );
}
