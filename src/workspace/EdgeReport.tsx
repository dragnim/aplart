/**
 * What a look at the rendered edges actually found.
 *
 * Shared by the two places that can show it, so there is one wording and one
 * caveat rather than two that drift. It reports and never concludes: the words
 * come from `edgeCheck.ts`, which says every time that this is a comparison of
 * pixels and not a proof about a program.
 *
 * In Tile it sits *beneath* the verdict, as corroboration. The verdict itself
 * comes from the artwork's construction, because a pixel comparison has known
 * false negatives — a motif tiling joins by continuation and its edges
 * legitimately differ, which is why Tile shows this only where identical edges
 * are what tiling means.
 */

import { describeEdge, edgeCheckCaveat, type EdgeCheck } from '@/renderer/edgeCheck';
import styles from './EdgeReport.module.css';

interface Props {
  readonly edges: EdgeCheck;
  /** The heading, which differs with how much weight the panel gives it. */
  readonly label?: string;
}

export function EdgeReport({ edges, label = 'Edge check' }: Props) {
  return (
    <div className={styles.report}>
      <span className={styles.label}>{label}</span>
      <p className={styles.reading} data-verdict={edges.horizontal.verdict}>
        {describeEdge('horizontal', edges.horizontal)}
      </p>
      <p className={styles.reading} data-verdict={edges.vertical.verdict}>
        {describeEdge('vertical', edges.vertical)}
      </p>
      <p className={styles.note}>{edgeCheckCaveat(edges.basis)}</p>
    </div>
  );
}
