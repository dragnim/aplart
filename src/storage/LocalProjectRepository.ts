/**
 * Projects kept in the browser.
 *
 * Every operation tolerates storage being unavailable. Private browsing, a
 * full quota and a blocked third-party context all make `localStorage` throw
 * on access rather than return null, and none of them should stop someone
 * making artwork — they should only stop it being remembered.
 */

import {
  PROJECT_SCHEMA_VERSION,
  type Project,
  type ProjectRepository,
  type ProjectSummary,
  type StoredMatrix,
} from './ProjectRepository';
import { migrateProject } from './storageMigrations';

const KEY_PREFIX = 'apl-art:project:';
const INDEX_KEY = 'apl-art:projects';

/**
 * Beyond this a stored matrix is dropped rather than saved.
 *
 * 40,000 cells is a 200×200 artwork, which is already larger than anything the
 * presets produce. Storing more risks the whole quota for a convenience.
 */
const MAX_STORED_CELLS = 40_000;

/** How many projects to keep. The oldest are dropped beyond this. */
const MAX_PROJECTS = 50;

/**
 * Returns the store, or null if it cannot be used.
 *
 * Reading `window.localStorage` is itself what throws in a blocked context, so
 * the access has to be inside the try.
 */
function store(): Storage | null {
  try {
    const candidate = globalThis.localStorage;
    if (candidate === undefined || candidate === null) return null;
    // Some browsers expose the object but reject every write; prove it works.
    const probe = '__apl-art-probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

export class LocalProjectRepository implements ProjectRepository {
  /** True when work can actually be remembered; the UI says so if not. */
  get available(): boolean {
    return store() !== null;
  }

  list(): Promise<ProjectSummary[]> {
    const storage = store();
    if (storage === null) return Promise.resolve([]);

    const summaries: ProjectSummary[] = [];
    for (const id of this.index(storage)) {
      const project = this.read(storage, id);
      if (project === null) continue;
      summaries.push({
        id: project.id,
        sourcePresetId: project.sourcePresetId,
        title: project.title,
        updatedAt: project.updatedAt,
      });
    }

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return Promise.resolve(summaries);
  }

  get(id: string): Promise<Project | null> {
    return Promise.resolve(this.getImmediate(id));
  }

  /**
   * The same read, without the promise.
   *
   * The repository interface is asynchronous so a remote implementation can
   * satisfy it later, but this store is not, and the workspace needs the saved
   * code *before* its first render. Restoring afterwards would draw the
   * preset's original code and then replace it, which flickers and briefly
   * tells the user something untrue about their own work.
   *
   * Only for first-render hydration. Everything else uses `get`.
   */
  getImmediate(id: string): Project | null {
    const storage = store();
    return storage === null ? null : this.read(storage, id);
  }

  save(project: Project): Promise<Project> {
    const storage = store();

    // The matrix is dropped from the record before the trimmed version is
    // spread back in. Spreading an empty object over a key does not remove it,
    // so keeping `...project` intact would preserve the very matrix that was
    // judged too large.
    const { lastSuccessfulMatrix: _oversized, ...withoutMatrix } = project;

    const stamped: Project = {
      ...withoutMatrix,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      ...trimMatrix(project.lastSuccessfulMatrix),
    };

    if (storage === null) return Promise.resolve(stamped);

    try {
      storage.setItem(KEY_PREFIX + stamped.id, JSON.stringify(stamped));

      const index = this.index(storage).filter((id) => id !== stamped.id);
      index.unshift(stamped.id);

      // Trim the oldest rather than letting the list grow without bound.
      for (const id of index.slice(MAX_PROJECTS)) {
        storage.removeItem(KEY_PREFIX + id);
      }
      storage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, MAX_PROJECTS)));
    } catch {
      // Out of quota, most likely. The artwork is unaffected; only the memory
      // of it is lost, and saying so on every keystroke would be noise.
    }

    return Promise.resolve(stamped);
  }

  remove(id: string): Promise<void> {
    const storage = store();
    if (storage === null) return Promise.resolve();

    try {
      storage.removeItem(KEY_PREFIX + id);
      storage.setItem(INDEX_KEY, JSON.stringify(this.index(storage).filter((entry) => entry !== id)));
    } catch {
      // Nothing useful to do.
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    const storage = store();
    if (storage === null) return Promise.resolve();

    try {
      for (const id of this.index(storage)) storage.removeItem(KEY_PREFIX + id);
      storage.removeItem(INDEX_KEY);
    } catch {
      // Nothing useful to do.
    }
    return Promise.resolve();
  }

  private index(storage: Storage): string[] {
    try {
      const raw = storage.getItem(INDEX_KEY);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    } catch {
      return [];
    }
  }

  private read(storage: Storage, id: string): Project | null {
    try {
      const raw = storage.getItem(KEY_PREFIX + id);
      if (raw === null) return null;

      const outcome = migrateProject(JSON.parse(raw));
      if (!outcome.ok) {
        // A record we cannot read is a record we will never be able to read;
        // clear it so it does not linger and fail again on every load.
        storage.removeItem(KEY_PREFIX + id);
        return null;
      }
      return outcome.project;
    } catch {
      return null;
    }
  }
}

/** Drops a stored matrix that is too large to be worth keeping. */
function trimMatrix(matrix: StoredMatrix | undefined): { lastSuccessfulMatrix?: StoredMatrix } {
  if (matrix === undefined) return {};
  if (matrix.rows * matrix.columns > MAX_STORED_CELLS) return {};
  return { lastSuccessfulMatrix: matrix };
}
