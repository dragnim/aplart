import { AplArtLogo } from '@/components/branding/AplArtLogo';
import styles from './SiteHeader.module.css';

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

      <nav className={styles.nav} aria-label="Main">
        <a
          className={styles.navLink}
          href="#/"
          {...(current === 'gallery' ? { 'aria-current': 'page' as const } : {})}
        >
          Gallery
        </a>
        <a
          className={styles.navLink}
          href="#/about"
          {...(current === 'about' ? { 'aria-current': 'page' as const } : {})}
        >
          About
        </a>
        <a
          className={styles.navLink}
          href="#/help"
          {...(current === 'help' ? { 'aria-current': 'page' as const } : {})}
        >
          Help
        </a>
      </nav>
    </header>
  );
}
