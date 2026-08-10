/**
 * The editing-mode icons, inline.
 *
 * Inline rather than `<img src=…>` for the reason the wordmark gives: an image
 * is a separate document, and `currentColor` inside it cannot see the colour of
 * the button it sits in. These files are drawn entirely in `currentColor`, so
 * inlining is what lets a selected tab take the artwork's own accent while the
 * rest stay quiet — and it keeps each file the single source of the artwork,
 * with no path data copied into this repository twice.
 *
 * Each file carries its secondary shapes at `opacity: 0.4`, which is the design's
 * own two-tone: the stylesheet strengthens that for the selected tab rather than
 * inventing a second treatment.
 *
 * The SVGs contain no `<title>`, `<desc>` or `id`, so nothing here competes with
 * the tab's accessible name and nothing collides when several of them share a
 * document. `aria-hidden` on the wrapper says so explicitly.
 */

import advancedIcon from '@/assets/icons/icon_advanced_01.svg?raw';
import animateIcon from '@/assets/icons/icon_animate_01.svg?raw';
import codeIcon from '@/assets/icons/icon_code_01.svg?raw';
import colourIcon from '@/assets/icons/icon_color_01.svg?raw';
import createIcon from '@/assets/icons/icon_create_01.svg?raw';
import tileIcon from '@/assets/icons/icon_tile_01.svg?raw';
import styles from './TabIcon.module.css';

import { type EditorTab } from './editorTabs';

const ARTWORK: Record<EditorTab, string> = {
  create: createIcon,
  colour: colourIcon,
  animate: animateIcon,
  tile: tileIcon,
  advanced: advancedIcon,
  code: codeIcon,
};

export function TabIcon({ tab }: { readonly tab: EditorTab }) {
  return (
    <span
      className={styles.icon}
      aria-hidden="true"
      // The file's own markup, unaltered. It is a build-time constant from this
      // repository, not anything a visitor or a service can influence.
      dangerouslySetInnerHTML={{ __html: ARTWORK[tab] }}
    />
  );
}
