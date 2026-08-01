/**
 * A touch-friendly way to type APL without an APL keyboard.
 *
 * Tapping a glyph inserts it at the cursor and returns focus to the editor, so
 * a run of symbols can be tapped out without reaching back to the text each
 * time.
 */

import { APL_SYMBOLS } from './aplSymbols';
import styles from './SymbolToolbar.module.css';

interface Props {
  readonly onInsert: (glyph: string) => void;
}

export function SymbolToolbar({ onInsert }: Props) {
  return (
    <div className={styles.wrapper}>
      <h2 className="visually-hidden" id="symbol-toolbar-heading">
        APL symbols
      </h2>
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-labelledby="symbol-toolbar-heading"
        aria-orientation="horizontal"
      >
        {APL_SYMBOLS.map((symbol) => (
          <button
            key={symbol.glyph}
            type="button"
            className={styles.symbol}
            // The name is the accessible label as well as the tooltip: a
            // button announced as "⍨" tells a screen reader user nothing.
            aria-label={`Insert ${symbol.name}, ${symbol.glyph}`}
            title={symbol.name}
            // The press must not steal focus from the editor, or the insertion
            // point would be lost before the click handler runs.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onInsert(symbol.glyph)}
          >
            {symbol.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
