import styles from './prose.module.css';

interface Props {
  /** Shown so the visitor can see which link failed. */
  readonly what: string;
}

export function NotFoundPage({ what }: Props) {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>We could not find that</h1>
      <p className={styles.lede}>{what}</p>
      <p className={styles.paragraph}>
        <a href="#/">Back to the gallery</a>
      </p>
    </article>
  );
}
