/**
 * Moving about the plane, on the artwork rather than beside it.
 *
 * Panning and zooming are how you look at a picture, not settings that describe
 * one — so they sit on the picture, where the thing they move is the thing you
 * are looking at. They used to be a row of buttons in the technical column, a
 * scroll away from the artwork they were steering.
 *
 * It owns no state about the view. Every button here calls a handler that reads
 * the viewport out of the APL source, moves it and writes it back, which is the
 * same path the drag on the canvas takes — one model of where the artwork is
 * looking, and it is the program itself.
 *
 * Only for artworks that declare a plane to explore. On a Modular Bloom there is
 * nowhere to pan to, and a compass over the picture would be a promise the
 * artwork cannot keep.
 */

import { useId, useState } from 'react';
import styles from './ArtworkNavigator.module.css';

interface Props {
  /** Fractions of the current span: negative is left and up. */
  readonly onPan: (across: number, down: number) => void;
  /** Below one zooms in, above one zooms out. */
  readonly onZoom: (factor: number) => void;
  readonly onBack: () => void;
  /** How many views are behind this one. */
  readonly backCount: number;
  /**
   * False when the code no longer says where the view is.
   *
   * Somebody who has rewritten `zoom←` into an expression is not served by a
   * button that would overwrite it, so the cluster stays and explains itself
   * rather than vanishing mid-session.
   */
  readonly available: boolean;
}

const STEP = 0.5;

export function ArtworkNavigator({ onPan, onZoom, onBack, backCount, available }: Props) {
  /*
   * Shown by default, and collapsible.
   *
   * The artwork is the point, so anything laid over it has to be dismissible —
   * but collapsing hides the controls, not the ability: the drag on the canvas
   * and the parameters in Advanced go on working either way.
   */
  const [open, setOpen] = useState(true);
  const controls = useId();

  return (
    <div className={styles.navigator} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={controls}
        onClick={() => setOpen((shown) => !shown)}
      >
        {open ? 'Hide navigation' : 'Show navigation'}
      </button>

      <div className={styles.cluster} id={controls} hidden={!open}>
        {available ? (
          <>
            <div className={styles.pad} role="group" aria-label="Move the view">
              <button
                type="button"
                className={`${styles.padButton} ${styles.padUp}`}
                onClick={() => onPan(0, -STEP)}
                aria-label="Pan up"
              >
                ↑
              </button>
              <button
                type="button"
                className={`${styles.padButton} ${styles.padLeft}`}
                onClick={() => onPan(-STEP, 0)}
                aria-label="Pan left"
              >
                ←
              </button>
              <button
                type="button"
                className={`${styles.padButton} ${styles.padRight}`}
                onClick={() => onPan(STEP, 0)}
                aria-label="Pan right"
              >
                →
              </button>
              <button
                type="button"
                className={`${styles.padButton} ${styles.padDown}`}
                onClick={() => onPan(0, STEP)}
                aria-label="Pan down"
              >
                ↓
              </button>
            </div>

            <div className={styles.row}>
              {/*
                Symbols rather than words, and named for anyone who cannot see
                them. This cluster lies over the artwork, and every pixel it takes
                is a pixel of the picture somebody cannot press to read a cell —
                so it is as small as it can be while staying a comfortable target.

                Each step is a fraction of the current span rather than a fixed
                amount: no single fixed step works across a seven-hundredfold
                range of zoom.
              */}
              <button type="button" className={styles.step} onClick={() => onZoom(0.5)} aria-label="Zoom in">
                +
              </button>
              <button type="button" className={styles.step} onClick={() => onZoom(2)} aria-label="Zoom out">
                −
              </button>
              <button type="button" className={styles.button} onClick={onBack} disabled={backCount === 0}>
                {/*
                  The view you came from, which is not the same offer as Undo.
                  Undo takes back the last change to the artwork, whatever kind it
                  was; this walks back through the places you have looked.

                  Named by what it says, with the count in the words rather than
                  in a label of its own: an `aria-label` here would hide the
                  visible text from voice control, which is what people say.
                */}
                Back{backCount > 0 ? ` (${String(backCount)})` : ''}
              </button>
            </div>
          </>
        ) : (
          <p className={styles.hint}>
            The code no longer says where the view is, so these cannot move it. Restore the centre and span
            lines in Advanced to bring them back.
          </p>
        )}
      </div>
    </div>
  );
}
