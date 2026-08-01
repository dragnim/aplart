/**
 * Which filters the gallery offers, and what each one means.
 *
 * Kept out of the component file so the module exports only components, which
 * is what fast refresh needs to reload cleanly during development.
 */

import { type ArtworkPreset } from '@/presets/schema';

export type FilterId = 'all' | 'pattern' | 'fractal' | 'geometry' | 'cellular' | 'beginner';

export const FILTERS: readonly { readonly id: FilterId; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pattern', label: 'Patterns' },
  { id: 'fractal', label: 'Fractals' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'cellular', label: 'Cellular' },
  { id: 'beginner', label: 'Beginner' },
];

/** Beginner filters by difficulty; the rest filter by category. */
export function matchesFilter(preset: ArtworkPreset, filter: FilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'beginner') return preset.difficulty === 'beginner';
  return preset.category === filter;
}
