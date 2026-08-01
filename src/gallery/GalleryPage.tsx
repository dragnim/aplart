import { presets } from '@/presets/presets';
import styles from './GalleryPage.module.css';

export function GalleryPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Tiny programs.
          <br />
          Infinite patterns.
        </h1>
        <p className={styles.intro}>
          Create patterns, fractals and generative art with Dyalog APL. Choose a piece, change the code and
          see what happens.
        </p>
      </section>

      <section className={styles.grid} aria-labelledby="gallery-heading">
        <h2 id="gallery-heading" className="visually-hidden">
          Artworks
        </h2>

        {presets.length === 0 ? (
          <p className={styles.empty}>The first artworks are still being written. Check back shortly.</p>
        ) : (
          presets.map((preset) => (
            <article key={preset.id} className={styles.card}>
              <h3>{preset.title}</h3>
              <p>{preset.description}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
