import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.line}>
        APL Art runs Dyalog APL through{' '}
        <a href="https://tryapl.org/" rel="noreferrer noopener" target="_blank">
          TryAPL
        </a>
        , the free online APL interpreter from{' '}
        <a href="https://www.dyalog.com/" rel="noreferrer noopener" target="_blank">
          Dyalog Ltd
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
