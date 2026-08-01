/**
 * Where a person's work lives.
 *
 * An interface rather than direct localStorage calls, for two reasons. The
 * user interface must not know where projects are kept, so a future release
 * can add accounts without touching it. And everything here is asynchronous
 * even though the local implementation is not, because a remote one would be
 * and callers should already be written for that.
 */

import { type RenderOptions } from '@/renderer/renderOptions';

/** The current shape of a stored project. Bump on any breaking change. */
export const PROJECT_SCHEMA_VERSION = 1;

export interface StoredMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly values: readonly number[];
}

export interface Project {
  readonly schemaVersion: number;
  readonly id: string;
  readonly sourcePresetId: string;
  readonly title: string;
  readonly code: string;
  readonly parameterValues: Readonly<Record<string, unknown>>;
  readonly paletteId: string;
  readonly renderOptions: RenderOptions;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * The last artwork that ran, so reopening a piece shows something
   * immediately instead of an empty canvas. Omitted when it would be too large
   * to be worth the space.
   */
  readonly lastSuccessfulMatrix?: StoredMatrix;
}

export interface ProjectSummary {
  readonly id: string;
  readonly sourcePresetId: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
  /** Removes everything this repository owns. Offered to the user in Help. */
  clear(): Promise<void>;
}
