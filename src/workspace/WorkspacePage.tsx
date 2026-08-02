/**
 * The creative workspace.
 *
 * Two columns on a wide screen — code and controls on the left, artwork on the
 * right — and stacked tabs on a narrow one, with the artwork first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analytics } from '@/analytics/Analytics';
import { AplEditor, type AplEditorHandle } from '@/editor/AplEditor';
import {
  restoreControlLine,
  setParameterValue,
  setParameterValues,
  type ParameterValue,
} from '@/editor/parameterBinding';
import { SymbolToolbar } from '@/editor/SymbolToolbar';
import { Dialog } from '@/components/Dialog/Dialog';
import { WIDE_LAYOUT_QUERY, useMediaQuery } from '@/app/useMediaQuery';
import { type AplExecutionService } from '@/execution/AplExecutionService';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { isUniform, readCell } from '@/matrix/matrixInspection';
import { matrixStats } from '@/matrix/matrixStats';
import { migratePresetCode } from '@/presets/codeMigrations';
import { getPreset } from '@/presets/presets';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import { ArtworkCanvas } from '@/renderer/ArtworkCanvas';
import { DEFAULT_ANIMATION, type AnimationSettings } from '@/renderer/paletteAnimation';
import { escapeSettingsFor } from './escapeSettings';
import { buildArtworkImage } from '@/renderer/CanvasRenderer';
import { checkEdges } from '@/renderer/edgeCheck';
import { DEFAULT_TILING, isRepeating } from '@/renderer/tiling';
import { defaultRenderOptions } from '@/renderer/renderOptions';
import { decodeShareState, toRenderOptions } from '@/sharing/decodeShareState';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { ParameterControls } from './ParameterControls';
import { InspectorControls } from './InspectorControls';
import { ValueInspector } from './ValueInspector';
import { furthestCorner } from './readingPlacement';
import { PrimitivePanel } from './PrimitivePanel';
import { TryChangingThis } from './TryChangingThis';
import { randomiseParameters } from './randomise';
import { readSavedProjectImmediate, useLocalProject } from './useLocalProject';
import { FocusToolbar } from './FocusToolbar';
import { type SourceCell, type SourceRect } from '@/renderer/displayMapping';
import {
  readViewport,
  panViewport,
  scaleViewport,
  sameViewport,
  selectionToViewport,
  viewportBounds,
  writeViewport,
  type Viewport,
} from './planeViewport';
import { useArtworkActions } from './useArtworkActions';
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

/** How many views back the Back button can reach. */
const VIEW_HISTORY_LIMIT = 40;

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
    if (shared !== null) {
      if (!shared.ok) return undefined;
      /*
       * Both routes bring code in from outside this version of the preset, so
       * both pass it through the same rename table. Applied here rather than in
       * the decoder and the storage reader separately: this is the point where
       * code becomes *this preset's* code, and it is the only place that has to
       * be got right.
       */
      const code = migratePresetCode(preset.id, shared.state.code);
      return {
        ...initialWorkspaceState(preset),
        code,
        renderOptions: toRenderOptions(shared.state),
        modified: code !== preset.code,
      };
    }

    // No shared link, so pick up where this browser left off. A link always
    // wins over saved work: someone following one wants to see what they were
    // sent, not what they were last doing.
    const saved = readSavedProjectImmediate(preset.id);
    if (saved === null) return undefined;

    const code = migratePresetCode(preset.id, saved.code);
    return {
      ...initialWorkspaceState(preset),
      code,
      renderOptions: saved.renderOptions,
      modified: code !== preset.code,
    };
  }, [shared, preset]);

  const workspace = useWorkspace({
    preset,
    ...(service === undefined ? {} : { service }),
    ...(initialState === undefined ? {} : { initialState }),
  });
  const { state, setCode, setRenderOptions, run, runCode, stop, inspectCell } = workspace;

  const editorHandle = useRef<AplEditorHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<MobileTab>('artwork');
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Carried into the share link so a randomised piece can be reproduced.
  const [seed, setSeed] = useState<number | undefined>(undefined);

  /*
   * Focus mode is session state and nothing more.
   *
   * It is deliberately not in the shared link or the saved project: it is how
   * someone is looking at the artwork right now, not part of the artwork. It
   * lives here rather than in the workspace reducer for the same reason — the
   * reducer holds what makes the picture.
   */
  const [focus, setFocus] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  /** The control that opened the drawer, so focus can go back to it. */
  const drawerOpener = useRef<HTMLElement | null>(null);
  /*
   * Exiting Focus mode cannot restore focus by remembering the element that
   * entered it: the two toolbars are different components, so the button that
   * was pressed no longer exists by then. The replacement is found instead.
   */
  const focusTrigger = useRef<HTMLButtonElement>(null);
  const restoreTrigger = useRef(false);

  /*
   * Animation, kept in three separate pieces on purpose.
   *
   * The base palette is in the render options, saved and shared. These settings
   * are session-only, which is what makes "never starts on its own" structural
   * rather than a rule to remember: there is nowhere for `running` to be stored.
   * And the phase is a ref, so a frame costs a repaint rather than a render of
   * the whole workspace.
   */
  const [animation, setAnimation] = useState<AnimationSettings>(DEFAULT_ANIMATION);
  const animationPhase = useRef(0);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const resetAnimation = useCallback(() => {
    animationPhase.current = 0;
    setAnimation({ ...DEFAULT_ANIMATION, running: false });
  }, []);

  /*
   * Read from the source that produced the matrix, not from the editor.
   *
   * Those differ the moment somebody edits without running, and the numbers on
   * screen were produced under the old ceiling. Colouring them against a new
   * one would repaint the artwork with no execution behind it and make the
   * inspector describe a cell holding 28 as having escaped before a limit of
   * 60 — a sentence about a calculation that has not happened.
   *
   * Given to both the canvas and the export, so a saved image is coloured
   * exactly the way the screen was.
   */
  const escape = useMemo(
    () =>
      state.result === null ? undefined : escapeSettingsFor(preset, state.result.source, state.renderOptions),
    [preset, state.result, state.renderOptions],
  );

  /*
   * The picture on screen while a banded run is delivering.
   *
   * Cells that have not arrived are marked not-a-number, which the renderer
   * leaves transparent so the background shows through. A number would have to
   * be a lie — zero is a value this calculation can nearly produce — and would
   * be indistinguishable from data both to the eye and to the colour mapping.
   */
  const partial = useMemo(() => {
    const progress = state.progress;
    if (progress === null) return null;

    const values = Float64Array.from(progress.values);
    values.fill(Number.NaN, progress.filled);

    return {
      matrix: { rows: progress.rows, columns: progress.columns, values },
      // Over what has actually arrived. Statistics taken over the whole buffer
      // would describe thousands of cells nobody has fetched.
      stats: matrixStats({
        rows: 1,
        columns: progress.filled,
        values: progress.values.subarray(0, progress.filled),
      }),
      /*
       * From the run's own captured source, not the editor and not the previous
       * result. Bands already on screen were produced under this source and go
       * on meaning what it says, however the code is edited while they land.
       */
      escape: escapeSettingsFor(preset, progress.source, state.renderOptions),
    };
  }, [state.progress, preset, state.renderOptions]);

  /**
   * What the canvas shows: the delivery if one is running, else the artwork.
   *
   * With one exception. A repeat is a preview of a finished pattern, and
   * repeating a half-delivered tile previews nothing — twenty-five copies of an
   * artwork that is mostly hatching, with the hatch itself reading as part of
   * the design. While copies are on screen the last complete result stays, and
   * the new one appears when it is whole.
   *
   * A first run has no complete result to keep, so the delivery is shown as it
   * arrives, singly. Better to watch one artwork build than to watch nothing.
   */
  const repeating = isRepeating(state.renderOptions.tiling);
  const keepComplete = repeating && partial !== null && state.result !== null;
  const shown = keepComplete ? state.result : (partial ?? state.result);
  const shownEscape = shown === state.result ? escape : partial?.escape;

  /*
   * The edge check, over the finished base tile.
   *
   * Deliberately not the composed view: mirror repeat hides a join by
   * reflecting one side onto the other, so measuring the composition would let
   * the reflection mark its own homework. And deliberately not the animated
   * palette either — the base one, so a running animation does not re-analyse
   * sixty times a second to reach the same answer.
   *
   * Only a completed result is ever analysed, so a delivery in flight leaves the
   * previous answer standing rather than replacing it with a partial one.
   */
  const {
    paletteId,
    customStops,
    colouring,
    invert,
    rotation,
    mirrorHorizontally,
    mirrorVertically,
    smoothScaling,
  } = state.renderOptions;

  const edges = useMemo(() => {
    if (state.result === null) return null;

    const { image } = buildArtworkImage({
      matrix: state.result.matrix,
      stats: state.result.stats,
      mode: preset.renderMode,
      /*
       * Rebuilt from the fields that shape one tile rather than passed whole,
       * so changing the repeat count does not re-render the artwork to answer
       * a question the repeat cannot affect. Truchet's motif renderer draws a
       * quarter of a million pixels; a radio button should not cost that.
       */
      options: {
        paletteId,
        ...(customStops === undefined ? {} : { customStops }),
        ...(colouring === undefined ? {} : { colouring }),
        invert,
        rotation,
        mirrorHorizontally,
        mirrorVertically,
        smoothScaling,
        tiling: DEFAULT_TILING,
      },
      ...(escape === undefined ? {} : { escape }),
    });

    return checkEdges(image);
  }, [
    state.result,
    preset.renderMode,
    escape,
    paletteId,
    customStops,
    colouring,
    invert,
    rotation,
    mirrorHorizontally,
    mirrorVertically,
    smoothScaling,
  ]);

  const actions = useArtworkActions({ preset, state, seed, animation, animationPhase, escape });

  useLocalProject(preset, state);

  useEffect(() => {
    analytics.track({ name: 'preset_opened', presetId: preset.id });
  }, [preset.id]);

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

  /**
   * Reset parameters puts the controls back without touching anything else the
   * user has written, so an edited expression survives. Reset artwork restores
   * the preset wholesale, which is the destructive one and asks first.
   */
  const handleResetParameters = useCallback(() => {
    const defaults = new Map(
      preset.parameters.map((parameter) => [parameter.variable, parameter.defaultValue]),
    );
    setCode(setParameterValues(state.code, defaults));
  }, [preset.parameters, state.code, setCode]);

  const handleResetArtwork = useCallback(() => {
    setCode(preset.code);
    setRenderOptions(defaultRenderOptions(preset.defaultPaletteId));
    setConfirmingReset(false);
  }, [preset, setCode, setRenderOptions]);

  const requestResetArtwork = useCallback(() => {
    // Only ask when there is something to lose. Confirming a reset that would
    // change nothing is just an extra click.
    if (state.modified) setConfirmingReset(true);
    else handleResetArtwork();
  }, [state.modified, handleResetArtwork]);

  const openDrawer = useCallback(() => {
    drawerOpener.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Back to whatever opened it, rather than to the top of the document.
    drawerOpener.current?.focus();
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }, [drawerOpen, closeDrawer, openDrawer]);

  const enterFocus = useCallback(() => {
    setFocus(true);
    // Opened straight away: arriving in Focus mode with no visible controls
    // leaves someone looking at a picture with no obvious way in.
    setDrawerOpen(true);
  }, []);

  const exitFocus = useCallback(() => {
    setFocus(false);
    setDrawerOpen(false);
    restoreTrigger.current = true;
  }, []);

  // Focus lands back on the button that leads into Focus mode, so leaving by
  // keyboard does not drop the caret at the top of the document.
  useEffect(() => {
    if (focus || !restoreTrigger.current) return;
    restoreTrigger.current = false;
    focusTrigger.current?.focus();
  }, [focus]);

  /*
   * Escape unwinds one layer at a time, innermost first.
   *
   * The drawer closes before Focus mode exits, so a single press never throws
   * away more than the person asked for.
   */
  useEffect(() => {
    if (!focus) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      // A dialog handles its own Escape; do not unwind past it.
      if (confirmingReset) return;

      event.preventDefault();
      if (drawerOpen) closeDrawer();
      else exitFocus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focus, drawerOpen, confirmingReset, closeDrawer, exitFocus]);

  /*
   * On a narrow screen the artwork is the backdrop, so it is not also a tab.
   * If it was the selected tab when Focus mode started, move off it.
   */
  const visibleTabs: readonly MobileTab[] = focus ? ['code', 'controls'] : ['artwork', 'code', 'controls'];
  /*
   * Derived rather than written back into `tab`. Correcting the stored choice
   * in an effect would both cascade a second render and overwrite what the
   * person had actually picked — this way their choice is remembered, and
   * leaving Focus mode returns them to the artwork they were on.
   */
  const shownTab: MobileTab = focus && tab === 'artwork' ? 'code' : tab;

  /*
   * Exploring the plane by dragging on the artwork.
   *
   * Every one of these ends in the same two steps: rewrite the three
   * assignments, then run what was written. Nothing keeps a view of its own —
   * the code is the view, which is why a drag is undoable in the editor and
   * shows up in a shared link without anything extra being stored.
   */
  const exploration = preset.planeExploration;
  /*
   * The view the artwork on screen is showing, which is the one every drag,
   * zoom and pan navigates away from — so it comes from the source that
   * produced the picture, not from the editor.
   *
   * The same boundary as the colouring below, and wrong in the same way if
   * ignored: with the span edited to 0.5 but not run, the canvas still shows
   * the 1.4 view, and mapping a dragged rectangle through 0.5 would zoom
   * somewhere the pointer never was. Falls back to the editor before the first
   * run, when there is no picture to disagree with.
   */
  const viewport =
    exploration === undefined ? null : readViewport(state.result?.source ?? state.code, exploration);
  const bounds = useMemo(
    () => (exploration === undefined ? null : viewportBounds(preset.parameters, exploration)),
    [exploration, preset.parameters],
  );

  /** Views departed from, most recent last. Session-only, like Focus mode. */
  const [viewHistory, setViewHistory] = useState<readonly Viewport[]>([]);

  const applyViewport = useCallback(
    (next: Viewport, options: { readonly remember: boolean }) => {
      if (exploration === undefined || viewport === null) return;
      if (sameViewport(next, viewport)) return;

      if (options.remember) {
        // Capped: an afternoon of zooming should not grow without limit, and
        // nobody steps back forty views.
        setViewHistory((previous) => [...previous, viewport].slice(-VIEW_HISTORY_LIMIT));
      }

      const updated = writeViewport(state.code, exploration, next);
      setCode(updated);
      // Run the code that was just written, not whatever the ref still holds.
      runCode(updated);
    },
    [exploration, viewport, state.code, setCode, runCode],
  );

  const handleSelectRegion = useCallback(
    (rect: SourceRect) => {
      if (viewport === null || bounds === null) return;
      applyViewport(selectionToViewport(viewport, rect, bounds), { remember: true });
    },
    [viewport, bounds, applyViewport],
  );

  const handleZoom = useCallback(
    (factor: number) => {
      if (viewport === null || bounds === null) return;
      applyViewport(scaleViewport(viewport, factor, bounds), { remember: true });
    },
    [viewport, bounds, applyViewport],
  );

  const handlePan = useCallback(
    (across: number, down: number) => {
      if (viewport === null || bounds === null) return;
      applyViewport(panViewport(viewport, across, down, bounds), { remember: true });
    },
    [viewport, bounds, applyViewport],
  );

  const handleBack = useCallback(() => {
    const previous = viewHistory.at(-1);
    if (previous === undefined) return;
    setViewHistory((history) => history.slice(0, -1));
    // Not remembered: stepping back and forth would otherwise fill the history
    // with the same two views.
    applyViewport(previous, { remember: false });
  }, [viewHistory, applyViewport]);

  /*
   * Inspecting a cell.
   *
   * The chosen cell is remembered in the matrix's own coordinates, so recolouring
   * or turning the artwork leaves it pointing at the same cell — and a new result
   * of a different shape simply stops matching, without an effect having to
   * reach in and clear it.
   *
   * The reading counts every cell sharing the value, so it is computed only when
   * the cell or the matrix changes. Never while the pointer is moving.
   */
  const inspected = state.inspected;

  /*
   * Where the reading sits, and whether it is showing.
   *
   * Both are presentation, both session-only. The anchor is where the press
   * landed, so the panel can move to the corner furthest from it; a cell named
   * through the keyboard has no press, and the panel keeps its usual place.
   */
  const [anchor, setAnchor] = useState<{ u: number; v: number } | null>(null);
  const [readingHidden, setReadingHidden] = useState(false);

  const setInspected = useCallback(
    (cell: SourceCell | null, at?: { u: number; v: number }) => {
      inspectCell(cell);
      setAnchor(at ?? null);
      // Choosing a cell is asking about it, so the reading comes back.
      setReadingHidden(false);
    },
    [inspectCell],
  );

  const clearInspection = useCallback(() => {
    inspectCell(null);
    setAnchor(null);
    setReadingHidden(false);
  }, [inspectCell]);

  /*
   * In Focus mode the drawer covers the left of the artwork, so the reading is
   * kept to the right of it whatever the press said. Everywhere else it is the
   * corner furthest from the selection.
   */
  const readingCorner =
    focus && drawerOpen ? ((anchor?.v ?? 1) < 0.5 ? 'bottom-right' : 'top-right') : furthestCorner(anchor);

  /*
   * Escape puts the reading away before it means anything else.
   *
   * On `document` and stopped from propagating, like the drag it sits beside, so
   * it reaches this before the window handler that would leave Focus mode. The
   * innermost thing open is the innermost thing the key should close.
   */
  useEffect(() => {
    if (inspected === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      inspectCell(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [inspected, inspectCell]);

  const reading = useMemo(() => {
    if (inspected === null || state.result === null) return null;
    return readCell(state.result.matrix, state.result.stats, inspected.row, inspected.column);
  }, [inspected, state.result]);

  /**
   * The ceiling the result was produced under, so a note cannot claim another.
   *
   * From the result's own source for the same reason as the colouring above: an
   * unrun edit changes what the next run will mean, not what this one meant.
   */
  const ceiling =
    preset.valueNotes === undefined || state.result === null
      ? null
      : numberAssignedTo(state.result.source, preset.valueNotes.ceilingVariable);

  /*
   * Only when nothing is chosen: pressing a cell answers the same question more
   * precisely, and repeating the general note over every press would be noise.
   */
  const viewNote =
    reading === null &&
    state.result !== null &&
    preset.valueNotes !== undefined &&
    isUniform(state.result.stats) &&
    // Uniform is not the same as uniformly at the limit. A view far outside the
    // set is equally flat and has not reached anything, so where the range is
    // known the note has to check rather than assume.
    (escape === undefined || state.result.stats.max >= escape.range.max)
      ? preset.valueNotes.viewAtCeiling
      : null;

  const handleRandomise = useCallback(() => {
    analytics.track({ name: 'randomise_used', presetId: preset.id });
    const { values, seed } = randomiseParameters(preset.parameters);
    setSeed(seed);
    // One code change for all of them, so undo treats it as a single action
    // and only one run follows.
    setCode(setParameterValues(state.code, values));
  }, [preset.id, preset.parameters, state.code, setCode]);

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
      <SymbolToolbar onInsert={(glyph) => editorHandle.current?.insertAtCursor(glyph)} />
      <RunPanel
        state={state}
        onRun={run}
        onStop={stop}
        onResetCode={handleResetCode}
        // The failed source verbatim, so a retry is the same run and not a new
        // one built from whatever the editor holds by now.
        onRetry={runCode}
      />
    </div>
  );

  /*
   * Order matters more here than it looks.
   *
   * The controls come first because they are what lets someone change the
   * artwork within seconds of arriving, which is the whole point. The prompts
   * only suggest what to change; having them above the sliders pushed the
   * sliders below the fold and put the advice before the means of taking it.
   *
   * Appearance stays next to Code controls so the contrast between "changes
   * the APL" and "changes only the picture" is visible at a glance — that
   * distinction is one of the things this application is trying to teach.
   */
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
        <div className={styles.parameterActions}>
          <button type="button" className={styles.secondary} onClick={handleRandomise}>
            Randomise
          </button>
          <button type="button" className={styles.secondary} onClick={handleResetParameters}>
            Reset parameters
          </button>
        </div>

        {/*
          The plane controls sit inside Code controls rather than in a section of
          their own, because that is exactly what they are: another way of
          setting the same three assignments the sliders above set. Separating
          them would suggest the artwork has a camera as well as a formula.

          They are also the keyboard route to everything the drag does. The
          sliders set the centre and the span directly; these step the view in
          and out without needing a pointer at all.
        */}
        {exploration !== undefined && (
          <div className={styles.viewActions}>
            <p className={styles.viewHint}>
              {viewport === null
                ? 'Drag a region on the artwork to zoom into it — available while the view lines are plain numbers.'
                : 'Drag a region on the artwork to zoom into it. The centre and span above are rewritten, and the code is run again.'}
            </p>
            {/*
              Zoom and pan in steps, which is the same view change the drag
              makes and the only one available without a pointer. Each step is a
              fraction of the current span rather than a fixed amount: no single
              fixed step works across a seven-hundredfold range of zoom.
            */}
            <div className={styles.parameterActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => handleZoom(0.5)}
                disabled={viewport === null}
              >
                Zoom in
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => handleZoom(2)}
                disabled={viewport === null}
              >
                Zoom out
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={handleBack}
                disabled={viewHistory.length === 0}
              >
                Back{viewHistory.length > 0 ? ` (${String(viewHistory.length)})` : ''}
              </button>
            </div>

            <div className={styles.parameterActions}>
              {(
                [
                  ['Pan left', -0.5, 0],
                  ['Pan right', 0.5, 0],
                  ['Pan up', 0, -0.5],
                  ['Pan down', 0, 0.5],
                ] as const
              ).map(([label, across, down]) => (
                <button
                  key={label}
                  type="button"
                  className={styles.secondary}
                  onClick={() => handlePan(across, down)}
                  disabled={viewport === null}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
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
          animation={animation}
          onAnimationChange={setAnimation}
          onAnimationReset={resetAnimation}
          reducedMotion={reducedMotion}
          escape={shownEscape}
          edges={edges}
        />
      </section>

      {/*
        The other way to choose a cell. Pressing the artwork is quicker and needs
        a pointer; this needs neither, and it is in the controls panel so that
        Focus mode gets it too — the drawer holds the same panel.
      */}
      {state.result !== null && (
        <section aria-labelledby="inspect-heading">
          <h2 className={styles.sectionHeading} id="inspect-heading">
            Read a value
          </h2>
          <p className={styles.sectionNote}>
            Press the artwork, or name a cell here. Neither changes the APL.
          </p>
          <InspectorControls
            rows={state.result.matrix.rows}
            columns={state.result.matrix.columns}
            selected={inspected}
            onInspect={setInspected}
          />
        </section>
      )}

      <TryChangingThis
        prompts={preset.tryChangingThis ?? []}
        openByDefault={preset.difficulty === 'beginner'}
      />

      <PrimitivePanel primitives={preset.primitives} />
    </div>
  );

  const artworkPanel = (
    <div className={styles.artworkPanel}>
      <ArtworkCanvas
        matrix={shown?.matrix ?? null}
        stats={shown?.stats ?? null}
        mode={preset.renderMode}
        options={state.renderOptions}
        busy={state.status === 'running'}
        canvasRef={canvasRef}
        exploration={
          exploration === undefined
            ? undefined
            : // Off when the code no longer says where the view is. Someone who
              // has rewritten `zoom←` into an expression is not served by a
              // drag that overwrites it.
              {
                /*
                 * Not while the artwork is repeated. A rectangle dragged across
                 * several copies names no single region of the plane, and
                 * zooming to whichever copy it started in would be a guess. The
                 * Pan and Zoom buttons still work, and they are unambiguous.
                 */
                enabled: viewport !== null && !isRepeating(state.renderOptions.tiling),
                onSelect: handleSelectRegion,
              }
        }
        // `reading` rather than `inspected`: a cell remembered from a result of a
        // different shape has already stopped matching, so the outline goes with
        // it rather than pointing somewhere that no longer exists.
        inspection={{
          marked: reading === null ? null : { row: reading.row, column: reading.column },
          onInspect: setInspected,
        }}
        // One instance. Focus mode restyles this same element rather than
        // mounting another, so there is one loop however the artwork is shown.
        animation={{ settings: animation, phase: animationPhase }}
        escape={shownEscape}
        /*
         * A delivery with nothing behind it is drawn once, never repeated: the
         * copies would be of an artwork that does not exist yet.
         */
        singleCopy={partial !== null && state.result === null}
      />

      <ValueInspector
        reading={readingHidden ? null : reading}
        viewNote={readingHidden ? null : viewNote}
        notes={preset.valueNotes}
        ceiling={ceiling}
        /*
         * The result's, never the delivery's. The inspector reads cells out of
         * the completed artwork, so it must describe them against the ceiling
         * that artwork was produced under — a run in flight has not replaced it
         * yet, and may never.
         */
        escape={escape}
        // A tiling's values choose a shape rather than measure anything.
        categorical={preset.renderMode === 'tiles'}
        corner={readingCorner}
        onHide={() => setReadingHidden(true)}
        onDismiss={clearInspection}
      />
    </div>
  );

  /*
   * Focus mode is a change of layout, not a second workspace.
   *
   * The same elements are rendered either way and CSS moves them, so entering
   * or leaving does not remount anything. That matters for more than tidiness:
   * remounting the editor would silently discard the undo history, and
   * remounting the canvas would throw away the artwork until the next run. It
   * also means there is exactly one copy of the studio state, so the code,
   * parameters and unsaved edits are necessarily the same in both.
   */
  const shell = (
    <div className={styles.page} data-focus={focus ? 'true' : undefined}>
      {focus ? (
        <FocusToolbar
          title={preset.title}
          state={state}
          actions={actions}
          drawerOpen={drawerOpen}
          onToggleDrawer={toggleDrawer}
          onExitFocus={exitFocus}
        />
      ) : (
        <WorkspaceToolbar
          preset={preset}
          state={state}
          actions={actions}
          onEnterFocus={enterFocus}
          focusButtonRef={focusTrigger}
          onResetArtwork={requestResetArtwork}
        />
      )}

      <Dialog
        open={confirmingReset}
        title="Reset this artwork?"
        onClose={() => setConfirmingReset(false)}
        actions={
          <>
            <button type="button" className={styles.secondary} onClick={() => setConfirmingReset(false)}>
              Keep my changes
            </button>
            <button type="button" className={styles.destructive} onClick={handleResetArtwork}>
              Reset everything
            </button>
          </>
        }
      >
        Your edits to the code, the parameters and the appearance will all be replaced with the original. This
        cannot be undone.
      </Dialog>

      {shareNotice !== null && !focus && (
        <p className={styles.shareNotice} role="status">
          {shareNotice}
        </p>
      )}

      {/* The outcome of a share, copy or export, announced from either toolbar. */}
      <p className={styles.actionNotice} role="status" aria-live="polite">
        {actions.notice}
      </p>

      {/*
        One layout tree, restyled.
        
        Chrome that only Focus mode needs is always rendered and hidden with
        CSS rather than added and removed. Inserting an element ahead of the
        editor would shift its position among its siblings, and React matches
        unkeyed children by position — so the editor would be torn down and
        rebuilt, losing its undo history, every time Focus mode was toggled.
        display: none also keeps the hidden chrome out of the tab order.
      */}
      {wide ? (
        <div className={styles.columns}>
          {/*
            In Focus mode this becomes an overlay drawer rather than a grid
            column: positioned over the artwork, so opening it never shrinks
            the piece.
          */}
          <div
            className={styles.leftColumn}
            id="focus-drawer"
            ref={drawerRef}
            data-drawer={focus ? (drawerOpen ? 'open' : 'closed') : undefined}
            // Closed drawer in Focus mode: inert removes its controls from the
            // tab order, so nothing hidden stays reachable behind the overlay.
            inert={focus && !drawerOpen}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Controls</h2>
              <button type="button" className={styles.secondary} onClick={closeDrawer}>
                Close
              </button>
            </div>
            {editorPanel}
            {controlsPanel}
          </div>
          {artworkPanel}
        </div>
      ) : (
        <div className={styles.stacked}>
          {/* The artwork sits behind the sheet in Focus mode, always visible. */}
          <div className={styles.focusBackdrop}>{focus ? artworkPanel : null}</div>

          <button
            type="button"
            className={styles.sheetHandle}
            aria-expanded={drawerOpen}
            aria-controls="focus-drawer"
            // Hidden while the sheet covers it: a control sitting invisibly
            // behind an opaque panel should not still be tabbable. The sheet
            // has its own Close.
            data-drawer={drawerOpen ? 'open' : 'closed'}
            onClick={toggleDrawer}
          >
            Controls
          </button>

          <div
            className={styles.sheet}
            id="focus-drawer"
            ref={drawerRef}
            data-drawer={focus ? (drawerOpen ? 'open' : 'closed') : undefined}
            // Closed drawer in Focus mode: inert removes its controls from the
            // tab order, so nothing hidden stays reachable behind the overlay.
            inert={focus && !drawerOpen}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Controls</h2>
              <button type="button" className={styles.secondary} onClick={closeDrawer}>
                Close
              </button>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Workspace">
              {visibleTabs.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  id={`tab-${name}`}
                  aria-selected={shownTab === name}
                  aria-controls={`panel-${name}`}
                  className={styles.tab}
                  data-selected={shownTab === name ? 'true' : undefined}
                  onClick={() => setTab(name)}
                >
                  {name === 'artwork' ? 'Artwork' : name === 'code' ? 'Code' : 'Controls'}
                </button>
              ))}
            </div>

            <div
              className={styles.tabPanel}
              role="tabpanel"
              id={`panel-${shownTab}`}
              aria-labelledby={`tab-${shownTab}`}
              tabIndex={0}
            >
              {/* Never both: in Focus mode the artwork lives in the backdrop. */}
              {shownTab === 'artwork' && !focus ? artworkPanel : null}
              {shownTab === 'code' ? editorPanel : null}
              {shownTab === 'controls' ? controlsPanel : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return shell;
}
