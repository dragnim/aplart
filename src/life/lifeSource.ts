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
 *
 * The notes below keep two claims apart, because conflating them would teach
 * somebody something false: B3/S23 is Conway's Game of Life and is not up for
 * negotiation, while the torus is one choice of boundary among several and is
 * made here because it is the one Scholes's expression makes.
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
⍝ Conway's rules: born on 3 neighbours, survives on 2 or 3.
⍝ The rotations join opposite edges, so this world is a torus.`;

/** How the panel labels each block, so the quotation is never mistaken for ours. */
export const ATTRIBUTION = {
  // The typographic apostrophe, as on the bar. The one in the APL below is an
  // ASCII quote because it is inside a comment in a source listing.
  title: 'Conway’s Game of Life',
  formulation: 'APL formulation by John Scholes',
  workspaceNote: 'As published in the dfns workspace.',
  videoNote: 'As developed in the 2009 Dyalog video.',

  /*
   * The rules and the boundary are two separate claims, and the panel keeps them
   * separate. B3/S23 is Conway's Game of Life; a torus is one choice of edge
   * among several, and the one this page makes because it is the one the
   * expression above makes. Running them together would teach somebody reading
   * this that Life wraps, which is not true of Life — only of this world.
   */
  rulesNote:
    'Conway’s rules, exactly: a dead cell with three living neighbours is born, a living cell with two or three survives, and every other cell dies. That is the whole of it. Nothing is added to the world after the first generation, and nothing steps in when it grows quiet.',
  boundaryNote:
    'Conway’s rules say nothing about edges, and different implementations answer that differently — an unbounded plane, a wall, or a wrap. Scholes’s rotations make opposite edges adjacent, so his world is a torus: a glider leaving the right-hand side arrives at the left. This one wraps too, to match the expression above.',
  colourNote:
    'The colours show how long each cell has been alive — newly born cells arrive brightest. That is only a way of seeing the world. The rules never read it, and it never changes what happens next.',
  /*
   * What is actually executing, said plainly.
   *
   * The expression above is the definition; the animation is an equivalent
   * implementation of it. Somebody watching forty-eight generations a second
   * could reasonably assume they were watching APL being interpreted frame by
   * frame, and they are not — saying so is the difference between a
   * demonstration and a conjuring trick.
   */
  engineNote:
    'The expression above defines the transformation. The animation applies it in your browser rather than asking TryAPL for each generation — twelve to forty-eight of them a second is not a network round trip — so what you are watching is an equivalent local implementation, not APL being interpreted frame by frame.',

  /*
   * And the word "equivalent" earning its place.
   *
   * It is a claim about two programs producing the same thing, which is either
   * checked or it is decoration. `tests/live/life.test.ts` is the check.
   */
  verificationNote:
    'Equivalent is checked rather than claimed: that implementation is compared against real APL execution of the expression above — every cell of every generation, over a still life, an oscillator, a glider, a glider crossing the edges of the torus, and a longer-running pattern.',
} as const;
