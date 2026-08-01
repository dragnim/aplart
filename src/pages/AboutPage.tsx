import styles from './prose.module.css';

export function AboutPage() {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>About APL Art</h1>
      <p className={styles.lede}>
        Every picture on this site is drawn from numbers produced by a few lines of Dyalog APL. Change the
        code, and the picture changes with it.
      </p>

      <section className={styles.section}>
        <h2 className={styles.heading}>How it works</h2>
        <p className={styles.paragraph}>
          Each artwork is a short APL program that returns a rectangular grid of numbers. APL Art sends that
          program to{' '}
          <a href="https://tryapl.org/" rel="noreferrer noopener" target="_blank">
            TryAPL
          </a>
          , reads back the grid, and colours each number according to the palette you have chosen. The artwork
          you see is always drawn from the result of running the code shown in the editor — nothing is
          simulated in the browser.
        </p>
        <p className={styles.paragraph}>
          That is also why the pictures are made of cells rather than smooth curves. An APL expression like{' '}
          <span className={styles.glyph}>9|∘.×⍨⍳64</span> produces a 64 by 64 table of numbers, and the
          renderer paints one cell per number.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Why APL</h2>
        <p className={styles.paragraph}>
          APL treats whole arrays as single values. There are no loops in most of these programs and no
          scaffolding around them; an expression that fits on one line describes thousands of numbers at once.
          That density is what makes the language good at generative art, and it is easier to see than to
          explain.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Credits and licensing</h2>
        <ul className={styles.list}>
          <li>
            APL execution is provided by{' '}
            <a href="https://tryapl.org/" rel="noreferrer noopener" target="_blank">
              TryAPL
            </a>
            , a free service from{' '}
            <a href="https://www.dyalog.com/" rel="noreferrer noopener" target="_blank">
              Dyalog Ltd
            </a>
            . APL Art is an independent project and is not an official Dyalog product.
          </li>
          <li>
            The APL glyphs are set in{' '}
            <a href="https://github.com/Dyalog/APL387" rel="noreferrer noopener" target="_blank">
              APL387
            </a>
            , released into the public domain under The Unlicence.
          </li>
          <li>
            APL Art itself is open source under the MIT Licence. The{' '}
            <a href="https://github.com/dragnim/aplart" rel="noreferrer noopener" target="_blank">
              source is on GitHub
            </a>
            .
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Privacy</h2>
        <p className={styles.paragraph}>
          There are no accounts, no analytics and no tracking. Your work is kept in your own browser's storage
          and never uploaded. The only thing that leaves your device is the APL code itself, sent to TryAPL so
          that it can be run.
        </p>
      </section>
    </article>
  );
}
