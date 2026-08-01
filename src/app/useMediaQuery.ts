import { useSyncExternalStore } from 'react';

/**
 * Tracks a media query in React state.
 *
 * The workspace has two genuinely different layouts, and rendering both and
 * hiding one with CSS is not an option: it would mount two editors, duplicate
 * every control's id, and give every label two things to point at. The layout
 * has to be chosen, not merely styled.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}

/** Matches the breakpoint the workspace stylesheet switches layouts at. */
export const WIDE_LAYOUT_QUERY = '(min-width: 60rem)';
