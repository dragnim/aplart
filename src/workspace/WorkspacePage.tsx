/**
 * The creative workspace.
 *
 * Two columns on a wide screen — code and controls on the left, artwork on the
 * right — and stacked tabs on a narrow one, with the artwork first.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AplEditor, type AplEditorHandle } from '@/editor/AplEditor';
import { restoreControlLine, setParameterValue, type ParameterValue } from '@/editor/parameterBinding';
import { WIDE_LAYOUT_QUERY, useMediaQuery } from '@/app/useMediaQuery';
import { type AplExecutionService } from '@/execution/AplExecutionService';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { getPreset } from '@/presets/presets';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import { ArtworkCanvas } from '@/renderer/ArtworkCanvas';
import { decodeShareState, toRenderOptions } from '@/sharing/decodeShareState';
import { ParameterControls } from './ParameterControls';
import { RenderControls } from './RenderControls';
import { RunPanel } from './RunPanel';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { useWorkspace } from './useWorkspace';
import { initialWorkspaceState } from './workspaceState';
import styles from './WorkspacePage.module.css';

interface Props {
  readonly presetId: string;
  readonly sharedState: string | null;
  /** Injected by end-to-end tests so runs are deterministic. */
  readonly service?: AplExecutionService;
}

type MobileTab = 'artwork' | 'code' | 'controls';

export function WorkspacePage({ presetId, sharedState, service }: Props) {
  const preset = getPreset(presetId);

  if (preset === undefined) {
    return <NotFoundPage what={`There is no artwork called “${presetId}”.`} />;
  }

  return (
    // Keyed on the link as well as the preset, so opening a different shared
    // creation rebuilds the workspace from it rather than keeping the old one.
    <Workspace
      key={`${preset.id}:${sharedState ?? ''}`}
      preset={preset}
      sharedState={sharedState}
      service={service}
    />
  );
}

function Workspace({
  preset,
  sharedState,
  service,
}: {
  readonly preset: ArtworkPreset;
  readonly sharedState: string | null;
  readonly service?: AplExecutionService | undefined;
}) {
  /*
   * A shared link is decoded before the first render rather than applied by an
   * effect afterwards. Doing it in an effect would render the preset's own code
   * first and then replace it, which flickers and makes the initial state a
   * lie. The component is keyed on the link, so this runs again if the link
   * changes.
   */
  const shared = useMemo(() => (sharedState === null ? null : decodeShareState(sharedState)), [sharedState]);

  const initialState = useMemo(() => {
    if (shared === null || !shared.ok) return undefined;
    return {
      ...initialWorkspaceState(preset),
      code: shared.state.code,
      renderOptions: toRenderOptions(shared.state),
      modified: shared.state.code !== preset.code,
    };
  }, [shared, preset]);

  const workspace = useWorkspace({
    preset,
    ...(service === undefined ? {} : { service }),
    ...(initialState === undefined ? {} : { initialState }),
  });
  const { state, setCode, setRenderOptions, run, stop } = workspace;

  const editorHandle = useRef<AplEditorHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<MobileTab>('artwork');
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);

  // Shared code is never run on arrival; the visitor is told what they have
  // been given and presses Run themselves.
  const shareNotice =
    shared === null
      ? null
      : shared.ok
        ? 'This artwork was shared with you. Press Run to draw it.'
        : `This shared link could not be opened: ${shared.reason}.`;

  const handleParameterChange = useCallback(
    (parameter: ArtworkParameter, value: ParameterValue) => {
      const updated = setParameterValue(state.code, parameter.variable, value);
      if (updated.ok) setCode(updated.code);
    },
    [state.code, setCode],
  );

  const handleParameterRestore = useCallback(
    (parameter: ArtworkParameter) => {
      setCode(restoreControlLine(state.code, parameter.variable, parameter.defaultValue));
    },
    [state.code, setCode],
  );

  const handleResetCode = useCallback(() => {
    setCode(preset.code);
  }, [preset.code, setCode]);

  const editorPanel = (
    <div className={styles.editorPanel}>
      <div className={styles.editorWrapper}>
        <AplEditor
          value={state.code}
          onChange={setCode}
          onRun={run}
          ariaLabel={`APL code for ${preset.title}`}
          handleRef={editorHandle}
        />
      </div>
      <RunPanel state={state} onRun={run} onStop={stop} onResetCode={handleResetCode} />
    </div>
  );

  const controlsPanel = (
    <div className={styles.controlsPanel}>
      <section aria-labelledby="code-controls-heading">
        <h2 className={styles.sectionHeading} id="code-controls-heading">
          Code controls
        </h2>
        <p className={styles.sectionNote}>These change the APL and need a run.</p>
        <ParameterControls
          parameters={preset.parameters}
          code={state.code}
          onChange={handleParameterChange}
          onRestore={handleParameterRestore}
        />
      </section>

      <section aria-labelledby="appearance-heading">
        <h2 className={styles.sectionHeading} id="appearance-heading">
          Appearance
        </h2>
        <p className={styles.sectionNote}>These change only how the result is drawn.</p>
        <RenderControls
          options={state.renderOptions}
          availablePaletteIds={preset.availablePaletteIds}
          onChange={setRenderOptions}
        />
      </section>
    </div>
  );

  const artworkPanel = (
    <div className={styles.artworkPanel}>
      <ArtworkCanvas
        matrix={state.matrix}
        stats={state.stats}
        mode={preset.renderMode}
        options={state.renderOptions}
        busy={state.status === 'running'}
        canvasRef={canvasRef}
      />
    </div>
  );

  return (
    <div className={styles.page}>
      <WorkspaceToolbar
        preset={preset}
        state={state}
        canvasRef={canvasRef}
        onResetArtwork={handleResetCode}
      />

      {shareNotice !== null && (
        <p className={styles.shareNotice} role="status">
          {shareNotice}
        </p>
      )}

      {/*
        Exactly one layout is rendered. Rendering both and hiding one would
        mount two editors and duplicate every control id on the page.
      */}
      {wide ? (
        <div className={styles.columns}>
          <div className={styles.leftColumn}>
            {editorPanel}
            {controlsPanel}
          </div>
          {artworkPanel}
        </div>
      ) : (
        <div className={styles.stacked}>
          <div className={styles.tabs} role="tablist" aria-label="Workspace">
            {(['artwork', 'code', 'controls'] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                id={`tab-${name}`}
                aria-selected={tab === name}
                aria-controls={`panel-${name}`}
                className={styles.tab}
                data-selected={tab === name ? 'true' : undefined}
                onClick={() => setTab(name)}
              >
                {name === 'artwork' ? 'Artwork' : name === 'code' ? 'Code' : 'Controls'}
              </button>
            ))}
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {tab === 'artwork' && artworkPanel}
            {tab === 'code' && editorPanel}
            {tab === 'controls' && controlsPanel}
          </div>
        </div>
      )}
    </div>
  );
}
