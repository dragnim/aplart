/**
 * Choosing a cell without a pointer.
 *
 * The artwork can be pressed, which is quick and needs a mouse or a finger. This
 * is the other way in, and it is not a lesser one: two numbers and a few
 * buttons, which is all a grid of cells needs.
 *
 * Deliberately not a list of cells. A hundred and twenty-eight squared is
 * sixteen thousand three hundred and eighty-four elements, which would be
 * unusable to navigate and slow to render for the sake of looking thorough.
 *
 * Coordinates are the matrix's own, counting from one. Rotating or mirroring the
 * artwork changes where a cell is drawn and never what it is called, so these
 * mean the same thing whatever the appearance controls are set to — and the same
 * thing a press produces.
 */

import { useState, type FormEvent } from 'react';
import { type SourceCell } from '@/renderer/displayMapping';
import styles from './InspectorControls.module.css';

interface Props {
  readonly rows: number;
  readonly columns: number;
  readonly selected: SourceCell | null;
  readonly onInspect: (cell: SourceCell | null) => void;
}

function clampTo(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(limit, Math.max(1, Math.round(value)));
}

/** The next cell in reading order, wrapping onto the following row. */
function step(cell: SourceCell, rows: number, columns: number, by: 1 | -1): SourceCell {
  const index = (cell.row - 1) * columns + (cell.column - 1) + by;
  const wrapped = ((index % (rows * columns)) + rows * columns) % (rows * columns);
  return { row: Math.floor(wrapped / columns) + 1, column: (wrapped % columns) + 1 };
}

export function InspectorControls({ rows, columns, selected, onInspect }: Props) {
  /*
   * What has been typed but not yet submitted, remembered along with the
   * selection it was typed against.
   *
   * Two things have to be true at once: a half-typed "1" out of "12" must not
   * choose a cell and count every match for it, and the fields must follow the
   * selection when it is made some other way — by pressing the artwork, or by
   * stepping. Tagging the draft with the selection it belongs to gets both
   * without an effect copying one piece of state into another: as soon as the
   * selection is a different object, the draft is stale and ignored.
   */
  const [draft, setDraft] = useState<{
    readonly against: SourceCell | null;
    readonly row: string;
    readonly column: string;
  } | null>(null);

  const live = draft !== null && draft.against === selected ? draft : null;
  const shownRow = live?.row ?? String(selected?.row ?? 1);
  const shownColumn = live?.column ?? String(selected?.column ?? 1);

  const edit = (field: 'row' | 'column', value: string) =>
    setDraft({ against: selected, row: shownRow, column: shownColumn, [field]: value });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onInspect({ row: clampTo(Number(shownRow), rows), column: clampTo(Number(shownColumn), columns) });
  };

  const disabled = rows === 0 || columns === 0;

  return (
    <form className={styles.controls} onSubmit={submit}>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="inspect-row">
            Row <span className={styles.of}>of {rows}</span>
          </label>
          <input
            id="inspect-row"
            className={styles.number}
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, rows)}
            step={1}
            value={shownRow}
            disabled={disabled}
            onChange={(event) => edit('row', event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="inspect-column">
            Column <span className={styles.of}>of {columns}</span>
          </label>
          <input
            id="inspect-column"
            className={styles.number}
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, columns)}
            step={1}
            value={shownColumn}
            disabled={disabled}
            onChange={(event) => edit('column', event.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        {/*
          Submitting is explicit, so a value is read once when it is meant rather
          than on every keystroke — which would also count every matching cell in
          the matrix each time a digit was typed.
        */}
        <button type="submit" className={styles.action} disabled={disabled}>
          Inspect
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) onInspect(step(selected, rows, columns, -1));
          }}
        >
          Previous cell
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) onInspect(step(selected, rows, columns, 1));
          }}
        >
          Next cell
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={selected === null}
          onClick={() => onInspect(null)}
        >
          Clear selection
        </button>
      </div>
    </form>
  );
}
