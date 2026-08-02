/**
 * Making a palette.
 *
 * Every change goes straight into the render options, so the artwork recolours
 * as it is edited — none of it re-runs the APL, because a palette is not part
 * of the calculation. Saving is debounced by the workspace's existing project
 * store, so a run of small adjustments costs one write rather than thirty.
 *
 * No dragging. A stop's place is a number between 0 and 100, typed or stepped
 * with the arrow keys, which needs no pointer and no explanation. A drag would
 * be a pleasant addition and is not what makes this usable.
 */

import { useCallback, useState } from 'react';
import {
  MAX_STOPS,
  MIN_STOPS,
  newStopId,
  normaliseColour,
  normaliseStops,
  paletteFromStops,
  type ColourStop,
} from '@/renderer/customPalette';
import styles from './PaletteEditor.module.css';

interface Props {
  readonly stops: readonly ColourStop[];
  readonly onChange: (stops: readonly ColourStop[]) => void;
}

/** How many changes can be taken back. Enough for a bad Randomise and a rethink. */
const UNDO_LIMIT = 20;

/**
 * A ramp that is worth looking at more often than not.
 *
 * Not a claim to taste: a random hue per stop gives confetti. One hue with a
 * drift, rising in lightness, is the shape almost every good ramp has, and it
 * is the shape the shipped ones have.
 */
function randomStops(): ColourStop[] {
  const count = 3 + Math.floor(Math.random() * 4);
  const hue = Math.random() * 360;
  const drift = (Math.random() - 0.5) * 90;
  const saturation = 0.45 + Math.random() * 0.4;

  return Array.from({ length: count }, (_unused, index) => {
    const along = index / (count - 1);
    return {
      id: newStopId(),
      colour: hslToHex((hue + drift * along + 360) % 360, saturation, 0.08 + along * 0.82),
      position: Math.round(100 * along),
    };
  });
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];

  const offset = lightness - chroma / 2;
  const byte = (value: number) =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r ?? 0)}${byte(g ?? 0)}${byte(b ?? 0)}`;
}

export function PaletteEditor({ stops, onChange }: Props) {
  /*
   * One level of history per change, held here rather than in the workspace.
   * The colours are part of the artwork's state, but *having changed your mind
   * about them* is not something to save or share.
   */
  const [history, setHistory] = useState<readonly (readonly ColourStop[])[]>([]);

  const commit = useCallback(
    (next: readonly ColourStop[]) => {
      setHistory((previous) => [...previous, stops].slice(-UNDO_LIMIT));
      onChange(normaliseStops(next));
    },
    [stops, onChange],
  );

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setHistory((entries) => entries.slice(0, -1));
    onChange(previous);
  }, [history, onChange]);

  const update = (id: string, change: Partial<Omit<ColourStop, 'id'>>) => {
    commit(stops.map((stop) => (stop.id === id ? { ...stop, ...change } : stop)));
  };

  const preview = paletteFromStops(stops);
  const gradient = preview.colours
    .map((colour, index) => `${colour} ${String((preview.positions?.[index] ?? 0) * 100)}%`)
    .join(', ');

  return (
    <div className={styles.editor}>
      {/*
        The ramp as the renderer will read it, including any hard edge where two
        stops share a place — built from the same function the artwork uses, so
        it cannot show something the artwork will not do.
      */}
      <div
        className={styles.preview}
        style={{ backgroundImage: `linear-gradient(to right, ${gradient})` }}
        role="img"
        aria-label={`Gradient of ${String(stops.length)} colours`}
      />

      <ul className={styles.stops}>
        {stops.map((stop, index) => (
          // Keyed by the stop's own id, not its index: stops are kept in
          // position order, so moving one past another renumbers both and a
          // list keyed by index would carry the focus to a different row.
          <li key={stop.id} className={styles.stop}>
            <input
              type="color"
              className={styles.swatch}
              value={stop.colour}
              aria-label={`Colour of stop ${String(index + 1)}`}
              onChange={(event) => update(stop.id, { colour: event.target.value })}
            />

            <input
              type="text"
              className={styles.hex}
              value={stop.colour}
              spellCheck={false}
              aria-label={`Hex value of stop ${String(index + 1)}`}
              onChange={(event) => {
                // Typed a character at a time, so most keystrokes are not yet a
                // colour. The field keeps what was typed; the artwork changes
                // when it becomes one.
                const parsed = normaliseColour(event.target.value);
                if (parsed !== null) update(stop.id, { colour: parsed });
              }}
            />

            <input
              type="number"
              className={styles.position}
              min={0}
              max={100}
              step={1}
              value={stop.position}
              aria-label={`Position of stop ${String(index + 1)}, per cent`}
              onChange={(event) => update(stop.id, { position: Number(event.target.value) })}
            />

            <button
              type="button"
              className={styles.remove}
              // Below two there is no gradient left to draw.
              disabled={stops.length <= MIN_STOPS}
              onClick={() => commit(stops.filter((candidate) => candidate.id !== stop.id))}
            >
              Remove stop {index + 1}
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={stops.length >= MAX_STOPS}
          onClick={() => {
            // Added in the largest gap, which is where there is room for it.
            const ordered = normaliseStops(stops);
            let at = 50;
            let widest = -1;
            for (let index = 1; index < ordered.length; index += 1) {
              const gap = (ordered[index]?.position ?? 0) - (ordered[index - 1]?.position ?? 0);
              if (gap > widest) {
                widest = gap;
                at = ((ordered[index]?.position ?? 0) + (ordered[index - 1]?.position ?? 0)) / 2;
              }
            }
            commit([...stops, { id: newStopId(), colour: '#ffffff', position: Math.round(at) }]);
          }}
        >
          Add stop
        </button>

        <button type="button" className={styles.action} onClick={() => commit(randomStops())}>
          Randomise colours
        </button>

        <button type="button" className={styles.action} disabled={history.length === 0} onClick={undo}>
          Undo
        </button>
      </div>
    </div>
  );
}
