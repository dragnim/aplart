import { assetUrl } from '@/app/config';
import { hrefForArtwork } from '@/app/router';
import { aplCharacterCount } from '@/presets/codeMetrics';
import { type ArtworkPreset } from '@/presets/schema';
import styles from './ArtworkCard.module.css';

interface Props {
  readonly preset: ArtworkPreset;
  /**
   * Whether to fetch the thumbnail immediately rather than when it scrolls near.
   *
   * A position, not a status. The card that opens the gallery is above the fold
   * on every screen, and deferring it is what makes the page appear to load in
   * two stages. It changes nothing that is drawn.
   */
  readonly eager?: boolean;
}

export function ArtworkCard({ preset, eager = false }: Props) {
  // The expression that runs, not the editor contents: comments and blank
  // lines are a larger number and a less true one.
  const characters = aplCharacterCount(preset.code);
  const titleId = `artwork-${preset.id}-title`;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <a className={styles.thumbnailLink} href={hrefForArtwork(preset.id)} tabIndex={-1} aria-hidden="true">
        <img
          className={styles.thumbnail}
          src={assetUrl(preset.thumbnailPath)}
          alt=""
          width={512}
          height={512}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      </a>

      <div className={styles.body}>
        {/*
          The category, and no longer a difficulty beside it.

          Beginner, Intermediate and Advanced described how hard the *program* is
          to read, which is a judgement about the APL rather than about the
          artwork — and on a card showing a picture, a title and a description, it
          was read as how hard the piece is to use. Colour-coded red for the
          fractals, which is a discouragement nobody meant to write.
        */}
        <div className={styles.tags}>
          <span className={styles.category}>{preset.category}</span>
        </div>

        <h3 className={styles.title} id={titleId}>
          {preset.title}
        </h3>
        <p className={styles.description}>{preset.description}</p>

        <p className={styles.primitives}>
          <span className={styles.glyphs} aria-hidden="true">
            {preset.primitives.slice(0, 5).map((primitive) => (
              <span key={primitive.glyph} className={styles.glyph}>
                {primitive.glyph}
              </span>
            ))}
          </span>
          <span className={styles.characters}>{characters} characters of APL</span>
        </p>

        {/*
          The whole card is not a link: it holds several pieces of information
          and a single enormous link is poor to navigate by keyboard or screen
          reader. One clearly named control instead.
        */}
        <a className={styles.open} href={hrefForArtwork(preset.id)}>
          Open<span className="visually-hidden"> {preset.title}</span>
        </a>
      </div>
    </article>
  );
}
