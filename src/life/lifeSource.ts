/**
 * The APL the code panel shows, and where it comes from.
 *
 * Two expressions, kept apart on purpose. One is John Scholes's, quoted as he
 * wrote it. The other is this application's, and differs only in being given a
 * starting world to run on — but it is ours, so it is labelled as ours. Nothing
 * here is paraphrased and then attributed to him.
 *
 * Provenance, checked rather than remembered:
 *
 *   - The dfns workspace page (dfns.dyalog.com/c_life.htm) gives the definition
 *     as `life←{↑1 ⍵∨.∧3 4=+/,¯1 0 1∘.⊖¯1 0 1∘.⌽⊂⍵}`.
 *   - Scholes's accompanying notes (dfns.dyalog.com/n_life.htm) state the rules
 *     and, on the boundary: "the use of ⊖ and ⌽ render opposite edges of the
 *     creatures' rectangular universe adjacent. In effect, they live on the
 *     surface of a torus (doughnut)."
 *   - The 2009 Dyalog video in which he develops the expression live arrives at
 *     a slightly different form, recorded below as well, because the video is
 *     what most people have actually seen.
 *
 * The simulation this application runs is a local implementation of the same
 * transformation — same rules, same toroidal boundary — because a generation
 * every few milliseconds cannot be a network round trip. It is held to the rules
 * by `lifeEngine.test.ts` rather than by assertion.
 */

/** The definition as published in the dfns workspace. */
export const SCHOLES_WORKSPACE = 'life←{↑1 ⍵∨.∧3 4=+/,¯1 0 1∘.⊖¯1 0 1∘.⌽⊂⍵}';

/** The form developed in the 2009 video, which differs in a few small details. */
export const SCHOLES_VIDEO = 'life←{⊃1 ⍵∨.∧3 4=+/+⌿¯1 0 1∘.⊖¯1 0 1⌽¨⊂⍵}';

/**
 * What the panel shows: the historical one-liner, then the two lines that make
 * it into something you can watch.
 *
 * Deliberately short. The whole point of the panel is that somebody reads it and
 * does not believe the screen behind it came from that.
 */
export const LIFE_APL = `⍝ Conway's Game of Life
⍝ APL formulation by John Scholes

life←{↑1 ⍵∨.∧3 4=+/,¯1 0 1∘.⊖¯1 0 1∘.⌽⊂⍵}

⍝ One generation of a world:  world←life world
⍝ Opposite edges are adjacent, so the world is a torus.`;

/** How the panel labels each block, so the quotation is never mistaken for ours. */
export const ATTRIBUTION = {
  // The typographic apostrophe, as on the bar. The one in the APL below is an
  // ASCII quote because it is inside a comment in a source listing.
  title: 'Conway’s Game of Life',
  formulation: 'APL formulation by John Scholes',
  workspaceNote: 'As published in the dfns workspace.',
  videoNote: 'As developed in the 2009 Dyalog video.',
  boundaryNote:
    'The rotations make opposite edges adjacent, so the world is a torus — the same boundary this simulation uses.',
  engineNote:
    'The animation runs an equivalent implementation in your browser, so a generation costs no network request. Same rules, same torus.',
} as const;
