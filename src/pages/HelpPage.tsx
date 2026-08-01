import { ClearLocalData } from './ClearLocalData';
import styles from './prose.module.css';

export function HelpPage() {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>Help</h1>
      <p className={styles.lede}>
        You do not need to know any APL to use this site. Open a piece, move a slider, and see what happens.
      </p>

      <section className={styles.section}>
        <h2 className={styles.heading}>Getting started</h2>
        <ul className={styles.list}>
          <li>Choose a piece from the gallery and open it.</li>
          <li>Drag a slider. The matching number in the code changes as you drag.</li>
          <li>
            Press <span className={styles.keys}>Run</span> to draw the artwork again, or turn on auto-run to
            redraw as you go.
          </li>
          <li>Try a different palette. Palettes recolour the existing result without re-running the code.</li>
          <li>Press Randomise for a variation, or Reset to return to the original.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Editing the code</h2>
        <p className={styles.paragraph}>
          The editor accepts any Dyalog APL that returns a rectangular grid of numbers. Type APL glyphs using
          the symbol toolbar beneath the editor, which inserts at the cursor and keeps your place.
        </p>
        <ul className={styles.list}>
          <li>
            Run the code with <span className={styles.keys}>Ctrl</span> +{' '}
            <span className={styles.keys}>Enter</span>, or <span className={styles.keys}>Cmd</span> +{' '}
            <span className={styles.keys}>Enter</span> on a Mac.
          </li>
          <li>
            Undo with <span className={styles.keys}>Ctrl</span> + <span className={styles.keys}>Z</span>.
          </li>
          <li>
            Anything after <span className={styles.glyph}>⍝</span> on a line is a comment.
          </li>
          <li>
            Negative numbers are written with a high bar, as in <span className={styles.glyph}>¯3</span>, not
            a minus sign.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Seeing the artwork larger</h2>
        <p className={styles.paragraph}>
          <strong>Focus mode</strong> gives the artwork the whole window. The code and the controls slide in
          over it from the side — from the bottom on a phone — so you can keep editing without leaving.
        </p>
        <ul className={styles.list}>
          <li>
            <span className={styles.keys}>Esc</span> puts the controls away. Pressing it again leaves Focus
            mode.
          </li>
          <li>
            Nothing is recalculated on the way in or out. It is the same code, the same parameters and the
            same artwork, shown differently.
          </li>
          <li>
            <strong>Fullscreen</strong>, inside Focus mode, also removes the browser&rsquo;s own chrome. Not
            every browser allows it — an iPhone will not — and where it is unavailable the button is simply
            not shown. Focus mode already fills the window.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Why did my code not run?</h2>
        <ul className={styles.list}>
          <li>
            <strong>An APL error.</strong> The interpreter rejected the expression. The error name and the
            position it stopped at are shown beneath the Run button.
          </li>
          <li>
            <strong>The result was not a grid of numbers.</strong> Artwork must be a rectangular numeric
            matrix — not text, not a nested array, and not a single number.
          </li>
          <li>
            <strong>The result was too large.</strong> There is a limit on how much data can be returned.
            Reduce the size parameter and try again.
          </li>
          <li>
            <strong>It took too long.</strong> TryAPL stops long-running expressions. Fractals with high
            iteration counts are the usual cause.
          </li>
        </ul>
        <p className={styles.paragraph}>
          Whatever the cause, your last successful artwork stays on screen and your code is left exactly as
          you wrote it.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Saving, sharing and exporting</h2>
        <ul className={styles.list}>
          <li>
            Your code, parameters and palette are saved in this browser automatically. There is no account and
            nothing is uploaded.
          </li>
          <li>
            Share copies everything needed to rebuild your piece into the link itself. Anyone opening it sees
            your code and presses Run to draw it.
          </li>
          <li>
            Export saves a PNG at the size you choose, with crisp edges for cell-based work. Turn on “Include
            caption” to add the artwork's name and how many characters of APL made it — useful if you are
            sharing the image somewhere the code cannot follow it.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Your data</h2>
        <ClearLocalData />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Keyboard and screen reader use</h2>
        <p className={styles.paragraph}>
          Every control can be reached with the keyboard, and the canvas carries a text description of the
          artwork's size and value range. Status changes such as "running" and "finished" are announced. If
          you find something that does not work, please{' '}
          <a href="https://github.com/dragnim/aplart/issues" rel="noreferrer noopener" target="_blank">
            open an issue
          </a>
          .
        </p>
      </section>
    </article>
  );
}
