/**
 * The glyphs offered by the symbol toolbar.
 *
 * Ordered by how often a beginner will reach for them rather than
 * alphabetically or by APL convention: on a phone the toolbar scrolls, and
 * whatever is off the right-hand edge may as well not exist.
 *
 * Every glyph carries a name, which becomes the button's accessible name.
 * A button labelled only "⍨" is unusable with a screen reader, and the
 * tooltip that sighted users get is not available to everyone.
 */

export interface AplSymbol {
  readonly glyph: string;
  /** Used as the accessible name and the tooltip. */
  readonly name: string;
}

export const APL_SYMBOLS: readonly AplSymbol[] = [
  // The ones every preset uses.
  { glyph: '←', name: 'Assign' },
  { glyph: '⍳', name: 'Index generator' },
  { glyph: '⍴', name: 'Reshape' },
  { glyph: '∘', name: 'Jot' },
  { glyph: '.', name: 'Dot' },
  { glyph: '×', name: 'Times' },
  { glyph: '÷', name: 'Divide' },
  { glyph: '|', name: 'Residue' },
  { glyph: '⍨', name: 'Selfie' },
  { glyph: '¯', name: 'High minus' },
  { glyph: '⍝', name: 'Comment' },
  { glyph: '⋄', name: 'Statement separator' },

  // Arithmetic and comparison.
  { glyph: '*', name: 'Power' },
  { glyph: '⍟', name: 'Logarithm' },
  { glyph: '○', name: 'Circular functions' },
  { glyph: '⌈', name: 'Ceiling or maximum' },
  { glyph: '⌊', name: 'Floor or minimum' },
  { glyph: '=', name: 'Equal' },
  { glyph: '≠', name: 'Not equal' },
  { glyph: '<', name: 'Less than' },
  { glyph: '>', name: 'Greater than' },
  { glyph: '≤', name: 'Less than or equal' },
  { glyph: '≥', name: 'Greater than or equal' },
  { glyph: '∧', name: 'And' },
  { glyph: '∨', name: 'Or' },
  { glyph: '~', name: 'Not or without' },

  // Rearranging arrays.
  { glyph: '⌽', name: 'Reverse or rotate' },
  { glyph: '⊖', name: 'Reverse or rotate first' },
  { glyph: '⍉', name: 'Transpose' },
  { glyph: '↑', name: 'Take' },
  { glyph: '↓', name: 'Drop' },
  { glyph: ',', name: 'Catenate' },
  { glyph: '⍪', name: 'Catenate first' },
  { glyph: '⊂', name: 'Enclose' },
  { glyph: '⊃', name: 'Disclose or first' },
  { glyph: '∪', name: 'Unique or union' },
  { glyph: '∩', name: 'Intersection' },

  // Selecting and searching.
  { glyph: '/', name: 'Replicate or reduce' },
  { glyph: '\\', name: 'Expand or scan' },
  { glyph: '⌿', name: 'Replicate or reduce first' },
  { glyph: '⍀', name: 'Expand or scan first' },
  { glyph: '⍋', name: 'Grade up' },
  { glyph: '⍒', name: 'Grade down' },
  { glyph: '⍸', name: 'Where or interval index' },
  { glyph: '⍷', name: 'Find' },
  { glyph: '∊', name: 'Enlist or membership' },

  // Operators and system names.
  { glyph: '⍤', name: 'Rank' },
  { glyph: '⍥', name: 'Over' },
  { glyph: '⍣', name: 'Power operator' },
  { glyph: '@', name: 'At' },
  { glyph: '⊤', name: 'Encode' },
  { glyph: '⊥', name: 'Decode' },
  { glyph: '⊢', name: 'Right' },
  { glyph: '⊣', name: 'Left' },
  { glyph: '⍺', name: 'Left argument' },
  { glyph: '⍵', name: 'Right argument' },
  { glyph: '⎕', name: 'Quad' },
];
