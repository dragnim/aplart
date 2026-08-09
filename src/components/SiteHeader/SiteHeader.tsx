/**
 * One bar, for every page.
 *
 * The artwork page used to carry three stacked bands: this header, a title row
 * with the artwork's name and a back link, and an action row with Focus, Share
 * and Export. Three full-width rules across the top of a page whose subject is a
 * picture — and the picture had whatever height was left.
 *
 * They are one bar now. The wordmark holds the left, the route fills the middle
 * with whatever it has to say about itself, and the menu holds the right. A page
 * with nothing contextual to add simply passes nothing, and the bar is a
 * wordmark and a menu.
 */

import { AplArtLogo } from '@/components/branding/AplArtLogo';
import { SiteMenu } from './SiteMenu';
import styles from './SiteHeader.module.css';

/**
 * Where a route puts what it has to say about itself.
 *
 * Filled by portal rather than by a prop, so the workspace can put its title and
 * actions in the bar without its state being lifted into `App` — and without the
 * artwork being remounted every time the bar re-renders. A page with nothing
 * contextual to add simply never portals, and the slot holds the middle open.
 */
export const APP_BAR_SLOT_ID = 'app-bar-slot';

interface Props {
  /** Which top-level destination is showing, so it can be marked current. */
  readonly current: 'gallery' | 'about' | 'help' | null;
}

export function SiteHeader({ current }: Props) {
  return (
    <header className={styles.header}>
      {/*
        The wordmark alone. There used to be a rounded square holding a ⍴ beside
        it, from when the wordmark was plain text and the header needed something
        of its own; the pixel logo says the same thing better, and two marks
        competing said less than one.

        The link carries the name and the logo inside it is decorative, so "APL
        Art" is announced once. Naming the wordmark instead would work equally well
        for a screen reader but would add a second image to the page, which is a
        thing tests and assistive technology both have to disambiguate from the
        artwork itself.
      */}
      <a className={styles.brand} href="#/" aria-label="APL Art">
        <AplArtLogo className={styles.wordmark} decorative />
      </a>

      <div className={styles.slot} id={APP_BAR_SLOT_ID} />

      <SiteMenu current={current} />
    </header>
  );
}
