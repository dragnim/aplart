⍝ Controls
size←96
width←12
relief←3

⍝ Alternate blocks carry the strap one way or the other
R←(size,size)⍴¯1+⍳size
C←⍉R
over←2|(⌊R÷width)+⌊C÷width

⍝ Each strap is shaded across its width, which is what makes the weave
⍝ read as over and under rather than as a plain grid
⌊0.5+99×(0.5+0.5×1○○2×(over×(width|C)÷width)+(~over)×(width|R)÷width)*relief÷3
