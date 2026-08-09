/**
 * Which filters the gallery offers, and what each one means.
 *
 * Kept out of the component file so the module exports only components, which
 * is what fast refresh needs to reload cleanly during development.
 *
 * One kind of filter now, where there used to be two. "Beginner" selected on the
 * preset's difficulty — a judgement about how hard its APL is to read — and sat
 * in a row of filters that were otherwise about what the artwork *is*. Two
 * different questions in one control, and the odd one out was the one making a
 * claim about the visitor.
 */

import { type ArtworkPreset } from '@/presets/schema';

export type FilterId = 'all' | 'pattern' | 'fractal' | 'geometry' | 'cellular';

export const FILTERS: readonly { readonly id: FilterId; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pattern', label: 'Patterns' },
  { id: 'fractal', label: 'Fractals' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'cellular', label: 'Cellular' },
];

/** Every filter but "All" names a category. */
export function matchesFilter(preset: ArtworkPreset, filter: FilterId): boolean {
  if (filter === 'all') return true;
  return preset.category === filter;
}
