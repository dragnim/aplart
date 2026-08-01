import styles from './SiteHeader.module.css';

interface Props {
  /** Which top-level destination is showing, so it can be marked current. */
  readonly current: 'gallery' | 'about' | 'help' | null;
}

export function SiteHeader({ current }: Props) {
  return (
    <header className={styles.header}>
      {/* The visible wordmark is the accessible name; the glyph is decorative. */}
      <a className={styles.brand} href="#/">
        <span className={styles.mark} aria-hidden="true">
          ⍴
        </span>
        <span className={styles.wordmark}>APL Art</span>
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
