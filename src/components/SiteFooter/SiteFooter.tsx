import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      {/*
        Names the language and the execution service, and stops there. APL Art
        is not anyone's product but its own, and saying whose service TryAPL is
        would imply a relationship that does not exist.
      */}
      <p className={styles.line}>
        APL Art runs Dyalog APL through{' '}
        <a href="https://tryapl.org/" rel="noreferrer noopener" target="_blank">
          TryAPL
        </a>
        .
      </p>
      <p className={styles.line}>
        <a href="https://github.com/dragnim/aplart" rel="noreferrer noopener" target="_blank">
          Source on GitHub
        </a>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <a href="#/about">About</a>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <a href="#/help">Help</a>
      </p>
    </footer>
  );
}
