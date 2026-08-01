import { useMemo, useState } from 'react';
import { presets } from '@/presets/presets';
import { ArtworkCard } from './ArtworkCard';
import { GalleryFilters } from './GalleryFilters';
import { FILTERS, matchesFilter, type FilterId } from './filterModel';
import styles from './GalleryPage.module.css';

export function GalleryPage() {
  const [filter, setFilter] = useState<FilterId>('all');

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

      <section aria-labelledby="gallery-heading">
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
