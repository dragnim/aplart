/**
 * Four numbers about the world, in the corner.
 *
 * Light instrumentation on a page whose subject is the picture, so it is small,
 * quiet and stationary: no charts, no history, nothing that moves except the
 * values. It sits bottom-left because the bar has the top and the APL panel has
 * the right, and it goes away with the rest of the interface because it is part
 * of the interface.
 *
 * ## Why two of them can be blank
 *
 * Generation and Population are properties of the world as it stands. Births,
 * deaths and activity are properties of the *step that produced it* — so a world
 * that no step produced has none of them, and says so with a dash rather than
 * with zero.
 *
 * That distinction is the whole design. A freshly seeded, randomised, emptied or
 * hand-painted world has not had a generation happen to it, and "no cells
 * changed" would be a claim about Life that nothing had asked Life to make.
 * Painting in particular must never read as births: the rules did not decide it.
 */

import { activity, population, type LifeWorld } from './lifeEngine';
import styles from './LifeStats.module.css';

interface Props {
  readonly world: LifeWorld;
}

/** An em dash: nothing to report, as distinct from nothing having happened. */
const NOTHING = '—';

const whole = new Intl.NumberFormat('en-GB');

/**
 * Births and deaths as one reading.
 *
 * Signed, because the signs are the point: one number went up and the other went
 * down, and a pair of bare integers would leave the reader to work out which.
 */
function describeChange(world: LifeWorld): string {
  if (world.transition === null) return NOTHING;
  const { births, deaths } = world.transition;
  return `+${whole.format(births)} / −${whole.format(deaths)}`;
}

function describeActivity(world: LifeWorld): string {
  const share = activity(world);
  return share === null ? NOTHING : `${share.toFixed(1)}%`;
}

export function LifeStats({ world }: Props) {
  const rows: readonly (readonly [string, string])[] = [
    ['Generation', whole.format(world.generation)],
    ['Population', whole.format(population(world))],
    ['Births / Deaths', describeChange(world)],
    ['Activity', describeActivity(world)],
  ];

  return (
    /*
     * A definition list, because that is what it is: four terms and their
     * current values. `aria-live` is deliberately absent — these change up to
     * forty-eight times a second, and announcing that would make the page
     * unusable with a screen reader. The canvas already carries a polite live
     * region saying the generation and the population at a human pace.
     */
    <dl className={styles.panel} aria-label="World statistics">
      {rows.map(([term, value]) => (
        <div className={styles.row} key={term}>
          <dt className={styles.term}>{term}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
