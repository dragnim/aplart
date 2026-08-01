import { FILTERS, type FilterId } from './filterModel';
import styles from './GalleryFilters.module.css';

interface Props {
  readonly active: FilterId;
  readonly counts: Readonly<Record<FilterId, number>>;
  readonly onChange: (filter: FilterId) => void;
}

export function GalleryFilters({ active, counts, onChange }: Props) {
  return (
    <div className={styles.filters} role="group" aria-label="Filter artworks">
      {FILTERS.map((filter) => {
        const count = counts[filter.id];
        // A filter that would empty the gallery is not offered at all, rather
        // than being offered and leading nowhere.
        if (count === 0) return null;

        return (
          <button
            key={filter.id}
            type="button"
            className={styles.filter}
            data-selected={active === filter.id ? 'true' : undefined}
            aria-pressed={active === filter.id}
            onClick={() => onChange(filter.id)}
          >
            {filter.label}
            <span className={styles.count} aria-hidden="true">
              {count}
            </span>
            <span className="visually-hidden">, {count} artworks</span>
          </button>
        );
      })}
    </div>
  );
}
