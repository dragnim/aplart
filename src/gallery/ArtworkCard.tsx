import { assetUrl } from '@/app/config';
import { hrefForArtwork } from '@/app/router';
import { type ArtworkPreset } from '@/presets/schema';
import styles from './ArtworkCard.module.css';

interface Props {
  readonly preset: ArtworkPreset;
  /** The featured piece is shown larger and loads eagerly. */
  readonly featured?: boolean;
}

export function ArtworkCard({ preset, featured = false }: Props) {
  const characters = [...preset.code].length;
  const titleId = `artwork-${preset.id}-title`;

  return (
    <article className={styles.card} data-featured={featured ? 'true' : undefined} aria-labelledby={titleId}>
      <a className={styles.thumbnailLink} href={hrefForArtwork(preset.id)} tabIndex={-1} aria-hidden="true">
        <img
          className={styles.thumbnail}
          src={assetUrl(preset.thumbnailPath)}
          alt=""
          width={512}
          height={512}
          loading={featured ? 'eager' : 'lazy'}
          decoding="async"
        />
      </a>

      <div className={styles.body}>
        <div className={styles.tags}>
          <span className={styles.category}>{preset.category}</span>
          <span className={styles.difficulty} data-level={preset.difficulty}>
            {preset.difficulty}
          </span>
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
