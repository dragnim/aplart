⍝ Controls
size←96
block←24
rings←3
shape←3

⍝ Distance from the middle of each block, measured two ways at once:
⍝ the larger coordinate draws a square, their sum draws a diamond
R←(size,size)⍴¯1+⍳size
C←⍉R
u←|((block|C)÷block)-0.5
v←|((block|R)÷block)-0.5

⍝ Blending the two turns a square into a diamond through every
⍝ eight-pointed star between them, and banding it gives the rings
mix←shape÷6
⌊0.5+99×1|rings×2×((u⌈v)×1-mix)+mix×(u+v)÷2
