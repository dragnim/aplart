/**
 * The APL, over the world rather than beside it.
 *
 * A drawer instead of a column, because the point of the panel is the moment
 * somebody reads four lines and looks back at the screen behind them — and a
 * screen that shrank to make room would spoil the comparison.
 *
 * One scrolling context. The panel scrolls; nothing inside it does. That is a
 * deliberate correction of the nested-scrollbar problem the Focus drawer has:
 * a person who scrolls here should never find that they have moved the wrong
 * thing.
 *
 * The code is shown rather than edited, so this is a `pre` in the APL typeface
 * rather than an editor. CodeMirror would bring its own scroller, its own key
 * handling and its own focus behaviour into an overlay that wants none of them.
 */

import { useEffect, useRef, useState } from 'react';
import { ATTRIBUTION, SCHOLES_VIDEO, SCHOLES_WORKSPACE } from './lifeSource';
import styles from './LifeCodePanel.module.css';

interface Props {
  readonly open: boolean;
  readonly apl: string;
  readonly onClose: () => void;
}

export function LifeCodePanel({ open, apl, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /*
   * Focus goes into the drawer when it opens and back where it came from when it
   * closes. Without the second half, closing the panel leaves the keyboard at
   * the top of the document and somebody has to tab back to where they were.
   */
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    closer.current?.focus();

    return () => {
      opener.current?.focus();
    };
  }, [open]);

  const copy = (text: string, what: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => setCopied(`${what} copied.`))
      .catch(() => setCopied('The clipboard was blocked by your browser.'));
  };

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 4000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      className={styles.drawer}
      id="life-code"
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label="The APL behind this artwork"
      data-open={open ? 'true' : 'closed'}
      // Out of the tab order entirely when shut, so a closed panel cannot be
      // reached by somebody who cannot see that it is closed.
      inert={!open}
    >
      <div className={styles.head}>
        <h2 className={styles.heading}>{ATTRIBUTION.title}</h2>
        <button type="button" className={styles.close} ref={closer} onClick={onClose}>
          Close
        </button>
      </div>

      <p className={styles.credit}>{ATTRIBUTION.formulation}</p>

      <section className={styles.block} aria-labelledby="life-code-running">
        <h3 className={styles.blockHeading} id="life-code-running">
          What is running
        </h3>
        <pre className={styles.apl}>{apl}</pre>
        <button type="button" className={styles.copy} onClick={() => copy(apl, 'APL')}>
          Copy APL
        </button>
      </section>

      <section className={styles.block} aria-labelledby="life-code-source">
        <h3 className={styles.blockHeading} id="life-code-source">
          Where it comes from
        </h3>
        <p className={styles.note}>{ATTRIBUTION.workspaceNote}</p>
        <pre className={`${styles.apl} ${styles.quotation}`}>{SCHOLES_WORKSPACE}</pre>
        <p className={styles.note}>{ATTRIBUTION.videoNote}</p>
        <pre className={`${styles.apl} ${styles.quotation}`}>{SCHOLES_VIDEO}</pre>
      </section>

      <section className={styles.block} aria-labelledby="life-code-notes">
        <h3 className={styles.blockHeading} id="life-code-notes">
          What the rules are, and where this world ends
        </h3>
        <p className={styles.note}>{ATTRIBUTION.rulesNote}</p>
        <p className={styles.note}>{ATTRIBUTION.boundaryNote}</p>
        <p className={styles.note}>{ATTRIBUTION.colourNote}</p>
        <p className={styles.note}>{ATTRIBUTION.engineNote}</p>
        <p className={styles.note}>{ATTRIBUTION.verificationNote}</p>
      </section>

      <p className={styles.notice} role="status" aria-live="polite">
        {copied}
      </p>
    </div>
  );
}
