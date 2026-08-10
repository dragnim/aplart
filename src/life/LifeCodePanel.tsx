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

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ATTRIBUTION, SCHOLES_VIDEO, SCHOLES_WORKSPACE } from './lifeSource';
import styles from './LifeCodePanel.module.css';

interface Props {
  readonly open: boolean;
  readonly apl: string;
  /**
   * The control that opens and closes this, so the keyboard can go back to it.
   *
   * There is no Close button in here. One button in the bar reads "View APL"
   * and then "Hide APL", which is the whole of the control: a second way to
   * shut a panel, inside the panel, is a second thing to find and a second thing
   * to explain.
   *
   * Named rather than remembered from `document.activeElement`, which is what
   * this used to do. Safari does not focus a button when it is clicked, so on an
   * iPhone the panel remembered the document body and "restoring" focus dropped
   * the keyboard at the top of the page — the exact thing the restoration exists
   * to prevent, on the one platform where tabbing back is hardest.
   */
  readonly returnFocusTo: RefObject<HTMLButtonElement | null>;
}

export function LifeCodePanel({ open, apl, returnFocusTo }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /*
   * Focus goes into the drawer when it opens and back to the toggle when it
   * closes. Without the second half, closing the panel leaves the keyboard at
   * the top of the document and somebody has to tab back to where they were.
   *
   * It goes to the panel rather than to a control inside it, and it goes with
   * `preventScroll`, and the page is clipped rather than hidden. Three guards
   * against one thing: at the moment focus arrives the panel is still off the
   * right-hand edge, and a browser asked to focus something off-screen scrolls
   * it into view — which here meant scrolling the whole page sideways and
   * dragging the world with it, measured as the canvas jumping 549px left and
   * easing back over the following frames while the panel it was making room for
   * needed no room at all.
   *
   * Measured separately, `overflow: clip` on the page is the one that settles
   * it and focusing the panel itself avoids it in practice; `preventScroll` is
   * the one that says so at the call site.
   */
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });

    // Read now rather than in the cleanup. The bar is never remounted, so the
    // two are the same button either way, and taking it here says so.
    const opener = returnFocusTo.current;
    return () => {
      opener?.focus({ preventScroll: true });
    };
  }, [open, returnFocusTo]);

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
      // Focusable but not tabbable: somewhere for the keyboard to arrive when
      // the panel opens, now that there is no button in here to give it to.
      tabIndex={-1}
    >
      <div className={styles.head}>
        <h2 className={styles.heading}>{ATTRIBUTION.title}</h2>
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
