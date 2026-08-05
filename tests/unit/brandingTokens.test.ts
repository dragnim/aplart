/**
 * Which token each branding detail reads, asserted from the stylesheets.
 *
 * Two things make this the right level for these particular checks. Several of
 * them are decisions *not* to theme something — the code editor's caret, the
 * global link colour, text selection — and a decision to leave a thing alone is
 * only durable if changing it fails a test. And some rules apply to states that
 * take several interactions to reach, where reading the rule is exact and
 * driving the interface to it is not.
 *
 * What the browser actually paints is checked in `tests/e2e/brandingDetail.spec.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const read = (...parts: readonly string[]) => readFileSync(join(SRC, ...parts), 'utf8');

/** The declaration block for a selector, so a rule cannot be found in a comment. */
function block(css: string, selector: string): string {
  // Anchored to the start of a line, or `a {` would be found inside `textarea {`.
  const index =
    css.indexOf(`
${selector} {`) + 1;
  expect(index, `${selector} is not in the stylesheet`).toBeGreaterThan(0);
  const start = index + selector.length + 2;
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('the header mark', () => {
  const css = read('components', 'SiteHeader', 'SiteHeader.module.css');

  it('uses the wordmark neutral, not the palette and not the fixed orange', () => {
    const mark = block(css, '.mark');

    // The same neutral as "apl", so "art" is the only colour in the header.
    expect(mark).toContain('background: var(--logo-neutral)');
    expect(mark).not.toContain('--accent-orange');
    expect(mark).not.toContain('--ui-accent-solid');
  });

  it('still marks the current page with the derived border', () => {
    expect(block(css, ".navLink[aria-current='page']")).toContain('var(--ui-accent-border)');
  });
});

describe('the artwork title', () => {
  const css = read('workspace', 'WorkspaceToolbar.module.css');

  it('is neutral text with one palette-responsive block before it', () => {
    expect(block(css, '.title')).not.toContain('--ui-accent');
    expect(block(css, '.title::before')).toContain('background: var(--ui-accent-solid)');
  });

  it('binds the block to the first word, so a long title cannot strand it', () => {
    const marker = block(css, '.title::before');

    // Margin rather than a space: there is no break opportunity to exploit.
    expect(marker).toContain('margin-right');
    expect(marker).toContain("content: ''");
  });
});

describe('the workspace section headings', () => {
  const workspace = read('workspace', 'WorkspacePage.module.css');

  it('carry the motif in its quieter form, and no accent on the words', () => {
    expect(block(workspace, '.sectionHeading')).not.toContain('--ui-accent');
    expect(block(workspace, '.sectionHeading::before')).toContain('background: var(--ui-accent-border)');
  });

  it('are subordinate to the artwork title, in size and in colour', () => {
    /*
     * The hierarchy, asserted rather than described: the wordmark is the
     * signature, the title's block echoes it, and these are quieter again. A
     * change that made them equal — or louder — has to fail here.
     */
    const emWidth = (css: string, selector: string) => {
      const match = /width:\s*([\d.]+)em/u.exec(block(css, selector));
      expect(match, `${selector} has no em width`).not.toBeNull();
      return Number.parseFloat((match as RegExpExecArray)[1] as string);
    };

    const toolbar = read('workspace', 'WorkspaceToolbar.module.css');
    expect(emWidth(workspace, '.sectionHeading::before')).toBeLessThan(emWidth(toolbar, '.title::before'));

    // The solid is the strongest accent; the border is a step down from it.
    expect(block(toolbar, '.title::before')).toContain('--ui-accent-solid');
    expect(block(workspace, '.sectionHeading::before')).toContain('--ui-accent-border');
  });

  it('stop there: nothing below them, and nothing in Focus mode', () => {
    expect(block(workspace, '.drawerTitle')).not.toContain('--ui-accent');
    expect(workspace).not.toContain('.drawerTitle::before');

    for (const file of [
      'RenderControls.module.css',
      'TilingControls.module.css',
      'ColouringControls.module.css',
    ]) {
      const css = read('workspace', file);
      expect(block(css, '.legend'), file).not.toContain('--ui-accent');
      expect(css, file).not.toContain('.legend::before');
    }

    const primitives = read('workspace', 'PrimitivePanel.module.css');
    expect(block(primitives, '.heading')).not.toContain('--ui-accent');
    expect(primitives).not.toContain('.heading::before');

    // The Focus-mode overlay title stays plain, so that mode reads calmer.
    const overlay = read('workspace', 'FocusToolbar.module.css');
    expect(block(overlay, '.title')).not.toContain('--ui-accent');
    expect(overlay).not.toContain('.title::before');
  });
});

describe('notices', () => {
  it('keeps the share notice neutral, because it also reports a broken link', () => {
    const notice = block(read('workspace', 'WorkspacePage.module.css'), '.shareNotice');

    expect(notice).toContain('border-left: 4px solid var(--border-strong)');
    expect(notice).not.toContain('--accent-orange');
    expect(notice).not.toContain('--ui-accent');
  });

  it('themes the confident tiling claim, and leaves the cautious one alone', () => {
    const css = read('workspace', 'ParameterControls.module.css');

    expect(block(css, '.edgeNote')).toContain('border-left: 3px solid var(--border-strong)');
    expect(block(css, ".edgeNote[data-compatible='true']")).toContain(
      'border-left-color: var(--ui-accent-border)',
    );
    // So no palette can make "not guaranteed" look like "seamless".
    expect(css).not.toContain(".edgeNote[data-compatible='false']");
  });
});

describe('things deliberately left as they were', () => {
  it('keeps the global link colour, which documentation depends on', () => {
    const css = read('styles', 'global.css');

    expect(block(css, 'a')).toContain('color: var(--accent-orange-strong)');
    expect(block(css, 'a')).not.toContain('--ui-accent');
  });

  it('keeps text selection stable rather than palette-coloured', () => {
    expect(block(read('styles', 'global.css'), '::selection')).toContain('--accent-orange');
  });

  it("keeps the editor's caret in the editor's own palette", () => {
    /*
     * The code editor has a syntax theme of its own — green strings, peach
     * numbers, an orange assignment arrow — and the caret matches it. Theming the
     * caret from the artwork palette would have it clash with the code around it
     * rather than connect to anything.
     */
    const editor = read('editor', 'AplEditor.tsx');

    expect(editor).toContain("caretColor: 'var(--accent-orange)'");
    expect(editor).not.toContain('--ui-accent');
  });
});

describe('the sweep', () => {
  it('leaves the fixed orange only where it was decided to stay', () => {
    /*
     * Everything else moved to the derived tokens in Stages 4 and 5. This is the
     * guard that keeps it that way: a new `--accent-orange` in a control or a
     * decoration has to either be justified here or be a mistake.
     */
    const allowed = [
      join('styles', 'tokens.css'), // where it is defined
      join('styles', 'global.css'), // links and selection
      join('editor', 'AplEditor.tsx'), // the editor's own theme
    ];

    const files = [
      join('components', 'SiteHeader', 'SiteHeader.module.css'),
      join('workspace', 'WorkspacePage.module.css'),
      join('workspace', 'WorkspaceToolbar.module.css'),
      join('workspace', 'RunPanel.module.css'),
      join('workspace', 'RenderControls.module.css'),
      join('workspace', 'ParameterControls.module.css'),
      join('workspace', 'TilingControls.module.css'),
      join('workspace', 'ColouringControls.module.css'),
      join('workspace', 'AnimationControls.module.css'),
      join('workspace', 'ValueInspector.module.css'),
      join('workspace', 'FocusToolbar.module.css'),
      join('renderer', 'ArtworkCanvas.module.css'),
    ];

    for (const file of files) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toContain('--accent-orange');
    }
    expect(allowed).toHaveLength(3);
  });

  it('uses the dark variants only where the surface is dark', () => {
    // The three places something accented sits on the artwork or the editor.
    expect(read('workspace', 'ValueInspector.module.css')).toContain('--ui-accent-border-on-dark');
    expect(read('renderer', 'ArtworkCanvas.module.css')).toContain('--ui-accent-border-on-dark');
    expect(read('workspace', 'FocusToolbar.module.css')).toContain('--ui-accent-text-on-dark');

    /*
     * And the light ones do not reach for the dark accents. Only the accent
     * variants: RunPanel's error detail is a genuinely dark block inside a light
     * panel and uses `--text-on-dark` correctly.
     */
    for (const file of ['RunPanel.module.css', 'WorkspaceToolbar.module.css', 'RenderControls.module.css']) {
      expect(read('workspace', file), file).not.toMatch(/--ui-accent-[a-z]+-on-dark/u);
    }
  });
});
