⍝ Controls
size←96
cell←8
seed←7
weight←1

⍝ One diagonal per tile, chosen by hashing where that tile sits.
⍝ The hash wraps over the whole grid, so the arrangement repeats
⍝ exactly once across it
R←(size,size)⍴¯1+⍳size
C←⍉R
tiles←size÷cell
pick←2|⌊43758.5453×1○(12.9898×tiles|⌊R÷cell)+(78.233×tiles|⌊C÷cell)+seed×0.6180339887

⍝ Both diagonals meet every edge at its midpoint, so whichever way a
⍝ tile falls its lines join the ones beside it
d←(pick×cell|C-R)+(~pick)×cell|C+R
⌊0.5+99×0⌈1-(cell⌊d⌊cell-d)÷weight
