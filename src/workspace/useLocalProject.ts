/**
 * Remembering a piece between visits.
 *
 * Saves are debounced: the code changes on every keystroke and every slider
 * step, and writing to storage that often would be wasteful for something
 * nobody is waiting on.
 *
 * Restoring happens before the first render, in the workspace component, so
 * this hook only has to handle writing and the initial read.
 */

import { useEffect, useRef } from 'react';
import { toNested } from '@/matrix/matrixTypes';
import { type ArtworkPreset } from '@/presets/schema';
import { LocalProjectRepository } from '@/storage/LocalProjectRepository';
import { PROJECT_SCHEMA_VERSION, type Project, type ProjectRepository } from '@/storage/ProjectRepository';
import { type WorkspaceState } from './workspaceState';

const SAVE_DEBOUNCE_MS = 700;

/** One shared instance; it holds no state of its own. */
export const localProjects = new LocalProjectRepository();

/** The stored id for a preset's working copy. One per preset. */
export function projectIdFor(presetId: string): string {
  return `preset:${presetId}`;
}

export function readSavedProject(
  presetId: string,
  repository: ProjectRepository = localProjects,
): Promise<Project | null> {
  return repository.get(projectIdFor(presetId));
}

/** Synchronous read, used only to hydrate the workspace before its first render. */
export function readSavedProjectImmediate(presetId: string): Project | null {
  return localProjects.getImmediate(projectIdFor(presetId));
}

/**
 * Writes the workspace to storage whenever it settles.
 *
 * Nothing is saved until the user has actually changed something: opening a
 * preset and leaving should not create a record, or every piece in the gallery
 * would look "in progress" after a browse.
 */
export function useLocalProject(
  preset: ArtworkPreset,
  state: WorkspaceState,
  repository: ProjectRepository = localProjects,
): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useRef(false);
  /** The most recent payload that has not yet been written. */
  const pending = useRef<Project | null>(null);

  const hasWork = state.modified || state.result !== null;

  /*
   * Flush on the way out, by both routes.
   *
   * The debounce timer is cleared whenever the state changes, which is what
   * makes it a debounce — but it is also lost when the workspace goes away,
   * and that is exactly when someone is most likely to leave: they have just
   * finished changing something.
   *
   * Moving to another route unmounts the component, so the cleanup covers it.
   * Closing the tab or following a link out does not run React cleanup at all,
   * so `pagehide` is needed as well. Writing to local storage is synchronous,
   * which is what makes it safe to do there.
   */
  useEffect(() => {
    const flush = () => {
      if (pending.current === null) return;
      void repository.save(pending.current);
      pending.current = null;
    };

    // pagehide rather than unload: it fires for the back/forward cache too,
    // and unload is unreliable on mobile.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [repository]);

  useEffect(() => {
    // Latched: once there is work, later renders keep saving even if the user
    // resets back to the original, so the reset itself is remembered too.
    if (hasWork) touched.current = true;
    if (!touched.current) return;

    const now = new Date().toISOString();
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: projectIdFor(preset.id),
      sourcePresetId: preset.id,
      title: preset.title,
      code: state.code,
      parameterValues: {},
      paletteId: state.renderOptions.paletteId,
      renderOptions: state.renderOptions,
      createdAt: now,
      updatedAt: now,
      ...(state.result === null
        ? {}
        : {
            lastSuccessfulMatrix: {
              rows: state.result.matrix.rows,
              columns: state.result.matrix.columns,
              values: toNested(state.result.matrix).flat(),
            },
          }),
    };

    // Recorded before the timer, so an unmount inside the debounce window
    // still has something to flush.
    pending.current = project;

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void repository.save(project);
      pending.current = null;
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [hasWork, preset.id, preset.title, state.code, state.renderOptions, state.result, repository]);
}
