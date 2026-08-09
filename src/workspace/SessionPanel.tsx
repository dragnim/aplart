/**
 * The one panel an artwork is edited from, beside the artwork it edits.
 *
 * Modes rather than places: Create, Colour, Animate, Advanced and Code all
 * describe the same artwork, the same source, the same palette and the same
 * history, and the tab only decides which of them you are looking at. The
 * technical controls used to live in a disclosure far below the picture, where
 * changing a palette meant scrolling to a control that changed something you
 * could no longer see.
 *
 * How many modes there are is the artwork's business, not this component's: one
 * without curated controls offers four and opens on Advanced.
 *
 * Every panel stays mounted and is hidden with `hidden` rather than removed from
 * the tree. That is not an optimisation: unmounting the Code panel would tear
 * down CodeMirror and take its undo history with it, and remounting the artwork
 * would throw the picture away until the next run.
 */

import { useCallback, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { TAB_NAMES, type EditorTab } from './editorTabs';
import { TabIcon } from './TabIcon';
import styles from './SessionPanel.module.css';

interface Props {
  readonly tab: EditorTab;
  readonly onTabChange: (tab: EditorTab) => void;
  /**
   * Which modes this artwork offers, in order.
   *
   * Passed in rather than read from `EDITOR_TABS` here, because an artwork with
   * no curated controls has no Create tab — and the tab bar, the arrow keys and
   * the panels below must all agree about that without any of them working it
   * out separately.
   */
  readonly tabs: readonly EditorTab[];
  /**
   * What each mode shows, by name.
   *
   * A record rather than one prop per mode, so that adding a mode is an entry in
   * `EDITOR_TABS` and an icon — nothing here counts them, and nothing here has to
   * be edited to make room. Modes absent from `tabs` are never rendered.
   */
  readonly panels: Record<EditorTab, ReactNode>;
  /** Randomise, Undo and Reset, which outlive the tab. */
  readonly actions: ReactNode;
}

export function SessionPanel({ tab, onTabChange, tabs, panels, actions }: Props) {
  const tabRefs = useRef(new Map<EditorTab, HTMLButtonElement>());

  /*
   * The arrow keys move between tabs, as the tab pattern requires: one tab stop
   * for the set, and the arrows choose within it. Home and End reach the ends.
   * Selection follows focus, which suits a panel whose tabs are instant and
   * lossless — nothing is submitted by looking at a mode.
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = tabs.indexOf(tab);
      const last = tabs.length - 1;

      const target =
        event.key === 'ArrowRight'
          ? tabs[index === last ? 0 : index + 1]
          : event.key === 'ArrowLeft'
            ? tabs[index === 0 ? last : index - 1]
            : event.key === 'Home'
              ? tabs[0]
              : event.key === 'End'
                ? tabs[last]
                : undefined;

      if (target === undefined) return;
      event.preventDefault();
      onTabChange(target);
      tabRefs.current.get(target)?.focus();
    },
    [tab, tabs, onTabChange],
  );

  return (
    <div className={styles.panel} data-session-panel="">
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Editing mode"
        onKeyDown={onKeyDown}
        // The column count follows the list rather than being written into the
        // stylesheet, so a mode can be added without touching the CSS.
        style={{ '--tab-count': tabs.length } as CSSProperties}
      >
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`editor-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`editor-panel-${name}`}
            /*
             * One tab stop for the whole set: the selected tab is reachable by
             * Tab, the rest by the arrow keys. Without this every mode would be
             * four presses of Tab away from the controls it contains.
             */
            tabIndex={tab === name ? 0 : -1}
            className={styles.tab}
            data-selected={tab === name ? 'true' : undefined}
            /*
             * The name is spoken by the button and shown on hover and focus by
             * the tooltip below; `title` is not doing the labelling, which is why
             * both exist.
             */
            aria-label={TAB_NAMES[name]}
            title={TAB_NAMES[name]}
            ref={(element) => {
              if (element === null) tabRefs.current.delete(name);
              else tabRefs.current.set(name, element);
            }}
            onClick={() => onTabChange(name)}
          >
            <TabIcon tab={name} />
            {/*
              Shown to everyone on hover and keyboard focus, and to a screen
              reader always. The tab bar is icons at rest because the panel is
              narrow, but a mode nobody can name is not a mode anybody can use.
            */}
            <span className={styles.tabName}>{TAB_NAMES[name]}</span>
          </button>
        ))}
      </div>

      <div className={styles.content} data-panel-content="">
        {tabs.map((name) => (
          <div
            key={name}
            className={styles.tabPanel}
            role="tabpanel"
            id={`editor-panel-${name}`}
            aria-labelledby={`editor-tab-${name}`}
            hidden={tab !== name}
            // Only the visible panel is reachable; a hidden one keeps its state
            // and its editor but takes no part in the tab order.
            tabIndex={tab === name ? 0 : undefined}
          >
            {panels[name]}
          </div>
        ))}
      </div>

      <div className={styles.actions} data-panel-actions="">
        {actions}
      </div>
    </div>
  );
}
