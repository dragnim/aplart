import { useMemo, useState } from 'react';
import { hrefForPlay } from '@/app/router';
import { presets, starterFor } from '@/presets/presets';
import { randomSeed } from '@/workspace/randomise';
import { ArtworkCard } from './ArtworkCard';
import { GalleryFilters } from './GalleryFilters';
import { FILTERS, matchesFilter, type FilterId } from './filterModel';
import styles from './GalleryPage.module.css';

export function GalleryPage() {
  const [filter, setFilter] = useState<FilterId>('all');

  /*
   * The seed "Start creating" would begin from: chosen once per visit to the
   * gallery, never on a render.
   *
   * A lazy initial state rather than a memo, because React guarantees this runs
   * exactly once for the life of the component while it may discard and recompute
   * a memo. Filtering the grid, resizing the window and re-rendering for any other
   * reason therefore leave the link alone — and coming back to the gallery is a
   * fresh visit, which offers a fresh artwork.
   */
  const [playSeed] = useState(randomSeed);
  /*
   * Which artwork the seed opens, as well as which variation of it. "Start
   * creating" used to be one artwork with a different set of numbers each time,
   * because Modular Bloom was the only piece with curated controls; it is now a
   * choice among the pattern families, and the seed makes it.
   */
  const starter = starterFor(playSeed);

  const counts = useMemo(() => {
    const result = {} as Record<FilterId, number>;
    for (const { id } of FILTERS) {
      result[id] = presets.filter((preset) => matchesFilter(preset, id)).length;
    }
    return result;
  }, []);

  const visible = useMemo(() => presets.filter((preset) => matchesFilter(preset, filter)), [filter]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Infinite patterns from tiny programs.</h1>
        <p className={styles.intro}>
          Create patterns, fractals and generative art with Dyalog APL. Choose a piece, change the code and
          see what happens.
        </p>

        {/*
          Two ways in, and they are not equals.

          Start creating is the dominant one because it is the shorter path to
          having made something: it opens an artwork already varied into somewhere
          worth looking, and draws it. Browsing is the considered route, kept as an
          ordinary link to the grid below — a jump within this page, not a
          navigation, so Back still means "the page before this one".
        */}
        <div className={styles.heroActions}>
          {starter !== undefined && (
            <a className={styles.start} href={hrefForPlay(starter.id, playSeed)}>
              Start creating
            </a>
          )}
          <a className={styles.browse} href="#gallery">
            Browse the gallery
          </a>
        </div>
      </section>

      <section id="gallery" className={styles.artworks} aria-labelledby="gallery-heading">
        <h2 id="gallery-heading" className="visually-hidden">
          Artworks
        </h2>

        {presets.length > 0 && <GalleryFilters active={filter} counts={counts} onChange={setFilter} />}

        <div className={styles.grid}>
          {visible.length === 0 ? (
            <p className={styles.empty}>
              {presets.length === 0
                ? 'The first artworks are still being written. Check back shortly.'
                : 'No artworks match that filter yet.'}
            </p>
          ) : (
            visible.map((preset) => (
              <ArtworkCard
                key={preset.id}
                preset={preset}
                // Only feature a piece in the unfiltered view; inside a filter
                // the emphasis would be arbitrary.
                featured={filter === 'all' && preset.featured === true}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
