/**
 * How iteration counts become colours.
 *
 * Only appears for a preset that declares what range its values come from,
 * which today is the one escape-time fractal. Everything else has no known
 * ceiling to map against and keeps normalising against its own contents.
 *
 * None of this runs the APL. It is a different reading of numbers that are
 * already in hand — and it cannot invent detail that those numbers do not
 * contain, which is why a view entirely at the limit stays one flat colour
 * under every mode here and says so in words instead.
 */

import {
  COLOURING_MODES,
  MAX_BAND_WIDTH,
  MAX_THRESHOLD_BANDS,
  MIN_BAND_WIDTH,
  MIN_THRESHOLD_BANDS,
  describeColouring,
  type Colouring,
} from '@/renderer/escapeColouring';
import { type ValueRange } from '@/renderer/escapeColouring';
import styles from './ColouringControls.module.css';

interface Props {
  readonly colouring: Colouring;
  /** The range as the visible code currently sets it, for the explanation. */
  readonly range: ValueRange;
  readonly onChange: (colouring: Colouring) => void;
}

function explain(colouring: Colouring, range: ValueRange): string {
  switch (colouring.mode) {
    case 'smooth':
      return `Spread evenly across ${String(range.min)} to ${String(range.max)}, so a value keeps its colour when you move or zoom.`;
    case 'bands':
      return 'One colour per palette entry, split equally across the range.';
    case 'repeating':
      return `A new colour every ${String(colouring.bandWidth)} iterations, cycling through the palette.`;
    case 'insideOutside':
      return 'Two colours: points that reached the iteration limit, and points that escaped before it.';
    case 'threshold':
      return `The range cut into ${String(colouring.thresholdBands)} equal bands.`;
  }
}

export function ColouringControls({ colouring, range, onChange }: Props) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Iteration colouring</legend>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="colouring-mode">
          Mode
        </label>
        <select
          id="colouring-mode"
          className={styles.select}
          value={colouring.mode}
          onChange={(event) => onChange({ ...colouring, mode: event.target.value as Colouring['mode'] })}
        >
          {COLOURING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {describeColouring(mode)}
            </option>
          ))}
        </select>
      </div>

      <p className={styles.note}>{explain(colouring, range)}</p>

      {/*
        The two numbers below belong to one mode each, and are shown only with
        it. A band width that does nothing is worse than no band width at all —
        somebody moves it, nothing happens, and they conclude it is broken.
      */}
      {colouring.mode === 'repeating' && (
        <NumberField
          id="colouring-band-width"
          label="Iterations per band"
          value={colouring.bandWidth}
          min={MIN_BAND_WIDTH}
          /*
           * A band wider than the whole range holds every value, so the rest of
           * the travel would do nothing at all. The current value still wins if
           * a link carried a larger one, rather than the handle sitting past
           * the end of its own track.
           */
          max={Math.max(colouring.bandWidth, Math.min(MAX_BAND_WIDTH, range.max - range.min))}
          onChange={(bandWidth) => onChange({ ...colouring, bandWidth })}
        />
      )}

      {colouring.mode === 'threshold' && (
        <NumberField
          id="colouring-threshold-bands"
          label="Number of bands"
          value={colouring.thresholdBands}
          min={MIN_THRESHOLD_BANDS}
          max={MAX_THRESHOLD_BANDS}
          onChange={(thresholdBands) => onChange({ ...colouring, thresholdBands })}
        />
      )}
    </fieldset>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label} <span className={styles.of}>{value}</span>
      </label>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
