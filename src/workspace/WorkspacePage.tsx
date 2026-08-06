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
import { hrefForHandoff } from '@/app/router';
import { type ArtworkParameter, type ArtworkPreset } from '@/presets/schema';
import { ArtworkCanvas } from '@/renderer/ArtworkCanvas';
import { DEFAULT_ANIMATION, type AnimationSettings } from '@/renderer/paletteAnimation';
import { accentPaletteFor, paletteSignature } from '@/theme/accentSource';
import { usePublishAccentPalette } from '@/theme/accentContext';
import { escapeSettingsFor } from './escapeSettings';
import { edgeClaimFor } from './edgeClaim';
import { buildArtworkImage } from '@/renderer/CanvasRenderer';
import { DIAGNOSTIC_PALETTE, checkEdgeRendering, checkEdgeValues } from '@/renderer/edgeCheck';
import { DEFAULT_TILING, isRepeating } from '@/renderer/tiling';
import { defaultRenderOptions, transformMatrix } from '@/renderer/renderOptions';
import { decodeShareState, toRenderOptions } from '@/sharing/decodeShareState';
import { numberAssignedTo } from '@/editor/parameterBinding';
import { ParameterControls } from './ParameterControls';
import { InspectorControls } from './InspectorControls';
import { ValueInspector } from './ValueInspector';
import { furthestCorner } from './readingPlacement';
import { PrimitivePanel } from './PrimitivePanel';
import { TryChangingThis } from './TryChangingThis';
import { randomiseParameters } from './randomise';
import { readPlaySeed, startCreating } from './startCreating';
import { generateInstantPlayVariation, randomSeed } from './instantPlayVariation';
import { playLabelFor } from '@/presets/instantPlay';
import { PlayControls } from './PlayControls';
import { revealTargetFor, type RevealTarget } from './peek';
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
import {
  HANDOFF_FROM,
  HANDOFF_TO,
  constantForCell,
  juliaSourceFor,
  readHandoff,
  storeHandoff,
} from './openAsJulia';
import styles from './WorkspacePage.module.css';

interface Props {
  readonly presetId: string;
  readonly sharedState: string | null;
  /** A session-only handoff token, as written by "Open as Julia set". */
  readonly handoff?: string | null;
  /** The seed a "Start creating" session began from, as written by the gallery. */
  readonly play?: string | null;
  /** Injected by end-to-end tests so runs are deterministic. */
  readonly service?: AplExecutionService;
}

type MobileTab = 'artwork' | 'code' | 'controls';

/** How many views back the Back button can reach. */
const VIEW_HISTORY_LIMIT = 40;

/**
 * What Play's Save image writes.
 *
 * One size rather than a menu, because this surface answers "save what I made"
 * and not "at which resolution". A thousand pixels is large enough to post and
 * small enough to send; the full choice is still in the toolbar's Export menu.
 */
const PLAY_EXPORT_SIZE = 1024;

export function WorkspacePage({ presetId, sharedState, handoff = null, play = null, service }: Props) {
  const preset = getPreset(presetId);

  if (preset === undefined) {
    return <NotFoundPage what={`There is no artwork called “${presetId}”.`} />;
  }

  return (
    // Keyed on the link as well as the preset, so opening a different shared
    // creation rebuilds the workspace from it rather than keeping the old one.
    // The play seed is part of that: two Start creating sessions are two
    // artworks, however few characters apart their links are.
    <Workspace
      key={`${preset.id}:${sharedState ?? ''}:${handoff ?? ''}:${play ?? ''}`}
      preset={preset}
      sharedState={sharedState}
      handoff={handoff}
      play={play}
      service={service}
    />
  );
}

function Workspace({
  preset,
  sharedState,
  handoff,
  play,
  service,
}: {
  readonly preset: ArtworkPreset;
  readonly sharedState: string | null;
  readonly handoff: string | null;
  readonly play: string | null;
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

  /*
   * A handoff is applied before the first render too, and for the same reason as
   * a shared link. It wins over saved work: somebody who has just pressed "Open
   * as Julia set" is asking for that constant, not for whatever they were last
   * doing on this artwork.
   *
   * An absent, malformed, out-of-date or wrongly-targeted payload reads as null
   * and the artwork simply opens on its own defaults.
   */
  const handedOff = useMemo(() => readHandoff(handoff, preset.id), [handoff, preset.id]);

  /*
   * A Start creating session, decided from the seed in the link and nothing else.
   *
   * Deliberately not `randomSeed()` called here: a variation chosen inside the
   * workspace would be a different artwork on every render, on every reload and
   * on Back, and none of them would be the one the link describes. The seed is
   * chosen once, in the gallery, by the press that asked for it.
   */
  const playSeed = useMemo(() => readPlaySeed(play), [play]);
  const started = useMemo(
    () => (playSeed === null ? null : startCreating(preset, playSeed)),
    [preset, playSeed],
  );

  const initialState = useMemo(() => {
    if (handedOff !== null) {
      const code = juliaSourceFor(handedOff);
      return {
        ...initialWorkspaceState(preset),
        code,
        // Edited, because it is: the constant differs from the preset's own.
        modified: code !== preset.code,
      };
    }

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

    /*
     * A Start creating session, which beats saved work for the same reason a
     * shared link does: pressing it is a request for a new artwork, not for
     * whatever this browser was last doing. Saved work is not lost — it is still
     * there on the artwork's own address, without the seed.
     */
    if (started !== null) {
      return {
        ...initialWorkspaceState(preset),
        code: started.code,
        // The seed the session began from, so sharing it passes on the number
        // that produced it and Undo has something consistent to restore.
        seed: started.seed,
        // Edited, because it is: the curated values differ from the preset's own.
        modified: started.code !== preset.code,
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
  }, [handedOff, shared, started, preset]);

  const workspace = useWorkspace({
    preset,
    ...(service === undefined ? {} : { service }),
    ...(initialState === undefined ? {} : { initialState }),
  });
  const { state, setCode, commitCode, undo, setRenderOptions, run, runCode, stop, inspectCell } = workspace;

  /*
   * A handoff runs itself, exactly once.
   *
   * Pressing "Open as Julia set" is a request to see that set, so waiting for a
   * second press would be asking the same question twice. A shared link is
   * deliberately different and still waits: following somebody else's link is
   * not the same as asking for a calculation.
   *
   * Guarded by a ref rather than by the dependency list, because `run` is
   * recreated when the code changes and this must not fire again for it.
   */
  const handoffRun = useRef(false);
  useEffect(() => {
    if (handedOff === null || handoffRun.current) return;
    handoffRun.current = true;
    run();
  }, [handedOff, run]);

  /*
   * A Start creating session draws itself, exactly once, and for the same reason
   * a handoff does: the press was the request. Arriving at code and a blank frame
   * would make "Start creating" the slowest way into the application rather than
   * the quickest.
   *
   * Once per workspace, not once per render — the component is keyed on the seed,
   * so a different session is a different workspace with its own ref, and this one
   * cannot fire again however the code is edited afterwards.
   */
  const startedRun = useRef(false);
  useEffect(() => {
    if (started === null || startedRun.current) return;
    startedRun.current = true;
    run();
  }, [started, run]);

  const editorHandle = useRef<AplEditorHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<MobileTab>('artwork');
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [confirmingReset, setConfirmingReset] = useState(false);
  /*
   * Which curated recipe the artwork on screen stands on.
   *
   * Only so that the next Randomise can offer a different one. A ref, not state:
   * nothing renders it, and it belongs to the sequence of presses rather than to
   * the artwork — after an Undo it still names the recipe just taken back, which
   * is the one least worth offering again.
   */
  const playRecipe = useRef<string | undefined>(started?.recipeId);

  /*
   * Whether this is a Play session, and what it offers.
   *
   * Both conditions, because either alone would be wrong: a seed in the link that
   * named no valid variation must not produce a Play surface with nothing behind
   * it, and a preset with Instant Play opened from its card is not a session — the
   * card is the ordinary way in and stays exactly that.
   */
  const playConfig = started === null ? undefined : preset.instantPlay;

  /*
   * The technical workspace's disclosure, held rather than controlled.
   *
   * Two things open it: the summary somebody presses, and "Edit the APL". A React
   * `open` prop cannot serve both — the element's toggle event is queued rather
   * than dispatched, so React restores the prop it last rendered before the event
   * arrives and the disclosure never opens at all. Left native and opened through
   * the ref, pressing the summary behaves exactly as a disclosure does and this is
   * only a second way to the same state.
   */
  const fullWorkspace = useRef<HTMLDetailsElement>(null);

  /**
   * A line the editor should be shown, once it is on screen to be shown it.
   *
   * Held rather than acted on immediately: the editor may be inside a closed
   * disclosure, an unselected tab or a shut drawer, and CodeMirror cannot scroll
   * something that is not being displayed. The state that uncovers it is set
   * first, and the reveal happens in an effect afterwards, by which time it is.
   *
   * The target is a ref and the trigger is a count, rather than one piece of
   * state holding both: an effect that cleared its own state would be a render
   * cascade, and the count already says "asked again" without anything to clear.
   * A null target is still a request — the control's line has gone, and the editor
   * should open and take focus anyway rather than the press seeming to do nothing.
   */
  const pendingReveal = useRef<RevealTarget | null>(null);
  const [revealRequest, setRevealRequest] = useState(0);

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

    const options = {
      paletteId,
      ...(customStops === undefined ? {} : { customStops }),
      ...(colouring === undefined ? {} : { colouring }),
      invert,
      rotation,
      mirrorHorizontally,
      mirrorVertically,
      smoothScaling,
      tiling: DEFAULT_TILING,
    };

    /*
     * A tiling's colour comes from the shape drawn over a cell, not from the
     * cell's value, so comparing values would compare nothing — two different
     * classes can draw motifs that meet identically at an edge. It gets a
     * rendering instead, with a fixed palette so no palette or animation phase
     * can move the answer.
     */
    if (preset.renderMode === 'tiles') {
      const { image } = buildArtworkImage({
        matrix: state.result.matrix,
        stats: state.result.stats,
        mode: preset.renderMode,
        options,
        palette: DIAGNOSTIC_PALETTE,
      });
      return checkEdgeRendering(image);
    }

    /*
     * Everything else has a number per cell, and comparing those depends on
     * nothing at all — not the palette, not its animation, not the viewport.
     * The transform is applied first so the edges compared are the finished
     * tile's, exactly as they would be repeated.
     */
    return checkEdgeValues(transformMatrix(state.result.matrix, options));
  }, [
    state.result,
    preset.renderMode,
    paletteId,
    customStops,
    colouring,
    invert,
    rotation,
    mirrorHorizontally,
    mirrorVertically,
    smoothScaling,
  ]);

  const edgeClaim = useMemo(() => edgeClaimFor(preset, state.result?.source ?? null), [preset, state.result]);

  // The seed comes from the workspace state now, so a share link and an Undo
  // cannot disagree about which number produced the artwork on screen.
  const actions = useArtworkActions({
    preset,
    state,
    seed: state.seed,
    animation,
    animationPhase,
    escape,
  });

  useLocalProject(preset, state);

  useEffect(() => {
    analytics.track({ name: 'preset_opened', presetId: preset.id });
  }, [preset.id]);

  /*
   * Tells the shell which colours the interface should follow.
   *
   * The palette state stays here; what leaves is a copy of the colours, so the
   * header can match the artwork without a second source of truth. Signature
   * rather than the palette object in the dependencies, so changing the
   * resolution or inverting the image — anything that leaves the colours alone —
   * publishes nothing and repaints nothing.
   *
   * An unusable custom palette resolves to null and is not published at all: the
   * shell keeps the last valid theme, which is what stops the interface flashing
   * through the default orange between two keystrokes in a colour field.
   */
  const publishAccentPalette = usePublishAccentPalette();
  const accentSignature = paletteSignature(accentPaletteFor(state.renderOptions));

  useEffect(() => {
    if (accentSignature === '') return;
    publishAccentPalette({ presetId: preset.id, colours: accentSignature.split(',') });
  }, [accentSignature, preset.id, publishAccentPalette]);

  useEffect(
    // Leaving the artwork returns the interface to its own colours. Separate from
    // the effect above so it runs on unmount and on nothing else.
    () => () => publishAccentPalette(null),
    [publishAccentPalette],
  );

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

  /**
   * "Open as Julia set", or null when the action does not apply.
   *
   * Offered only from Mandelbrot, only once a run has completed, and only with a
   * cell selected — there is no coordinate without one. Deliberately not offered
   * on pointer movement: a hover is not a choice, and previewing one would mean
   * running an artwork nobody asked for.
   *
   * The coordinate comes from the completed result's own source and matrix, so
   * unrun edits in the editor and controls that have moved since do not affect
   * it. What is on screen is what the selection belongs to.
   */
  const openAsJulia = useMemo(() => {
    if (preset.id !== HANDOFF_FROM) return null;
    if (state.result === null || inspected === null) return null;

    const constant = constantForCell(preset, state.result.source, state.result.matrix, inspected);
    if (constant === null) return null;

    return () => {
      const token = storeHandoff(constant);
      if (token === null) return;
      // A hash change, so the existing router notices and Back returns here
      // with this artwork exactly as it was left.
      window.location.hash = hrefForHandoff(HANDOFF_TO, token).slice(1);
    };
  }, [preset, state.result, inspected]);

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
    // One code change for all of them, so undo treats it as a single action
    // and only one run follows. The seed travels with it, so the artwork stays
    // reproducible and stepping back restores the seed that made this one.
    commitCode(setParameterValues(state.code, values), { label: 'Randomise', seed });
  }, [preset.id, preset.parameters, state.code, commitCode]);

  /*
   * Randomise, as the Play surface offers it.
   *
   * The same generator the gallery's link uses, given a fresh seed and the recipe
   * already on screen so that it moves somewhere else. One commit for all three
   * values, then one run of exactly the source that was written — so the whole
   * thing is a single step back, and the artwork that appears is the artwork the
   * code describes.
   */
  const handlePlayRandomise = useCallback(() => {
    analytics.track({ name: 'randomise_used', presetId: preset.id });

    const variation = generateInstantPlayVariation(preset, randomSeed(), playRecipe.current);
    if (variation === null) return;
    playRecipe.current = variation.recipeId;

    const next = setParameterValues(state.code, variation.values);
    commitCode(next, { label: 'Randomise', seed: variation.seed });
    runCode(next);
  }, [preset, state.code, commitCode, runCode]);

  /**
   * A step of a Play gesture: the value is written, the artwork waits.
   *
   * Running on every step of a drag would send the public service forty requests
   * to draw thirty-nine pictures nobody looked at, so the run happens when the
   * gesture ends. The gesture's identity makes all of its steps one undo entry.
   */
  const handlePlayAdjust = useCallback(
    (parameter: ArtworkParameter, value: number, gesture: string) => {
      const updated = setParameterValue(state.code, parameter.variable, value);
      if (!updated.ok) return;
      commitCode(updated.code, { label: playLabelFor(preset, parameter), coalesce: gesture });
    },
    [preset, state.code, commitCode],
  );

  /*
   * The gesture ended, so draw what it left behind.
   *
   * Guarded on the source having actually changed: a slider pressed and released
   * without moving, or a control merely focused and left, must not ask the public
   * service for the picture already on screen. The code is passed explicitly
   * rather than read through `run`, whose ref is written by an effect — this fires
   * in the same breath as the last adjustment, which is too soon to rely on that.
   */
  /**
   * "Edit the APL": show me the line this control writes.
   *
   * Everything it does is presentation. It opens whichever container is hiding
   * the editor in this layout — the disclosure on a wide screen, the Code tab on a
   * narrow one, the drawer in Focus mode — and asks the editor to reveal the line.
   * Nothing is dispatched to the workspace, so the source, the artwork, the seed,
   * the palette and the Play history are all exactly as they were, and the address
   * does not change: opening the editor is not a page somebody should have to
   * press Back out of.
   */
  const handleEditApl = useCallback(
    (parameter: ArtworkParameter) => {
      if (fullWorkspace.current !== null) fullWorkspace.current.open = true;
      // The narrow layout keeps the editor in a tab; harmless on a wide one,
      // which does not render tabs at all.
      setTab('code');
      // In Focus mode the drawer is where the editor lives. Opening it is the
      // existing way to work on the code there, and it keeps one editor rather
      // than putting a second one in the overlay.
      if (focus) setDrawerOpen(true);

      pendingReveal.current = revealTargetFor(state.code, parameter);
      setRevealRequest((count) => count + 1);
    },
    [focus, state.code],
  );

  /*
   * The reveal itself, once the render that uncovered the editor has happened.
   *
   * Cleared as it fires, so an unrelated render cannot repeat it. Focus lands in
   * the editor either way: with the assignment selected when there is one, and at
   * the caret where it was when the control's line has gone — a press that opened
   * the editor and left focus behind would be the confusing outcome.
   */
  useEffect(() => {
    if (revealRequest === 0) return;

    const target = pendingReveal.current;
    pendingReveal.current = null;

    if (target === null) {
      editorHandle.current?.focus();
      return;
    }
    editorHandle.current?.revealLine(target.line, { select: { from: target.from, to: target.to } });
  }, [revealRequest]);

  const handlePlayAdjustEnd = useCallback(() => {
    const drawn = state.result !== null && state.result.source === state.code;
    const arriving = state.progress !== null && state.progress.source === state.code;
    if (drawn || arriving) return;

    runCode(state.code);
  }, [state.result, state.progress, state.code, runCode]);

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
          /*
           * From the source that produced the artwork, not the editor. Editing
           * the class count changes what the next run will be able to say and
           * nothing about the one on screen.
           */
          edges={edgeClaim}
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
          cells={preset.renderMode !== 'tiles'}
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
        onOpenAsJulia={openAsJulia}
        onHide={() => setReadingHidden(true)}
        onDismiss={clearInspection}
      />
    </div>
  );

  /*
   * The Play surface, when this workspace was opened as a session.
   *
   * One element, rendered beside the artwork and moved by CSS — under it
   * ordinarily, floating over it in Focus mode — so there is one copy of it in the
   * tree and no layout has its own version.
   *
   * Absent entirely otherwise. An artwork opened from its card is the workspace it
   * always was, which is also why no existing behaviour can be affected by
   * anything in here.
   */
  const playPanel =
    playConfig === undefined ? null : (
      <div className={styles.playArea}>
        <PlayControls
          preset={preset}
          config={playConfig}
          code={state.code}
          onAdjust={handlePlayAdjust}
          onAdjustEnd={handlePlayAdjustEnd}
          onEditApl={handleEditApl}
          onRandomise={handlePlayRandomise}
          onUndo={undo}
          undoLabel={state.past.at(-1)?.label ?? null}
          onSaveImage={() => actions.exportAt(PLAY_EXPORT_SIZE)}
          onShare={actions.share}
          canSave={state.result !== null}
          busy={state.status === 'running'}
        />
      </div>
    );

  /*
   * The editor and every technical control, which is also the Focus-mode drawer.
   *
   * In a session it is behind a disclosure: still here, still one press away, but
   * no longer the first thing on the page. Closed by default and never unmounted —
   * a `details` hides its contents without removing them, so the editor keeps its
   * own undo history whether it has been opened or not.
   */
  const secondaryColumn = (
    <div
      className={styles.leftColumn}
      id="focus-drawer"
      ref={drawerRef}
      data-drawer={focus ? (drawerOpen ? 'open' : 'closed') : undefined}
      // Closed drawer in Focus mode: inert removes its controls from the tab
      // order, so nothing hidden stays reachable behind the overlay.
      inert={focus && !drawerOpen}
    >
      <div className={styles.drawerHeader}>
        <h2 className={styles.drawerTitle}>Controls</h2>
        <button type="button" className={styles.secondary} onClick={closeDrawer}>
          Close
        </button>
      </div>
      {playConfig === undefined ? (
        <>
          {editorPanel}
          {controlsPanel}
        </>
      ) : (
        <details className={styles.fullWorkspace} ref={fullWorkspace}>
          <summary className={styles.fullWorkspaceSummary}>Code and full controls</summary>
          {editorPanel}
          {controlsPanel}
        </details>
      )}
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
        <div className={styles.columns} data-play={playConfig === undefined ? undefined : 'true'}>
          {/*
            In a session the artwork and its three controls come first, in the
            document as well as on screen, and the technical workspace follows.
            Ordinarily the editor leads, as it always has.

            The order is decided once, when the workspace is built: a session and
            an ordinary opening are separate addresses, so nothing here changes
            under a mounted component and no element is ever moved between
            positions — which would remount the editor and lose its undo history.
          */}
          {playConfig === undefined ? (
            <>
              {secondaryColumn}
              {artworkPanel}
            </>
          ) : (
            <>
              {artworkPanel}
              {playPanel}
              {secondaryColumn}
            </>
          )}
        </div>
      ) : (
        <div className={styles.stacked} data-play={playConfig === undefined ? undefined : 'true'}>
          {/* The artwork sits behind the sheet in Focus mode, always visible. */}
          <div className={styles.focusBackdrop}>
            {focus ? artworkPanel : null}
            {focus ? playPanel : null}
          </div>

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
              {/*
                With the artwork, not in a tab of its own. On a phone the Play
                controls are the workspace — putting them one tab away from the
                picture they change would make a session feel like the long route
                in, and the two are what somebody arrived to use together.
              */}
              {shownTab === 'artwork' && !focus ? playPanel : null}
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
