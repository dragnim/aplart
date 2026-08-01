/**
 * Bringing older share links up to the current schema.
 *
 * Links are permanent in a way that stored data is not: someone can post one
 * and it may be opened years later. Every version that has ever been published
 * has to keep working, so migrations are additive and a version is never
 * reused for a different shape.
 *
 * Version 1 — the first published format.
 */

import { SHARE_SCHEMA_VERSION } from './shareState';

export type MigrationResult =
  | { readonly ok: true; readonly state: Record<string, unknown> }
  | { readonly ok: false; readonly reason: string };

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*.
 *
 * When the schema changes, bump SHARE_SCHEMA_VERSION and add an entry here
 * that turns the old shape into the new one.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // An unversioned payload predates the version field; treat it as version 1,
  // which is the only shape that could have produced it.
  0: (state) => ({ ...state, v: 1 }),
};

export function migrateShareState(state: Record<string, unknown>, fromVersion: number): MigrationResult {
  let current = state;
  let version = fromVersion;
  // A malformed chain must not be able to spin here.
  let guard = 0;

  while (version < SHARE_SCHEMA_VERSION || version === 0) {
    const migration = MIGRATIONS[version];
    if (migration === undefined) {
      return { ok: false, reason: `this link uses an unsupported format (version ${version})` };
    }

    current = migration(current);
    const next = typeof current.v === 'number' ? current.v : version + 1;

    if (next <= version) {
      return { ok: false, reason: 'this link could not be brought up to date' };
    }
    version = next;

    guard += 1;
    if (guard > 32) return { ok: false, reason: 'this link could not be brought up to date' };
  }

  return { ok: true, state: current };
}
