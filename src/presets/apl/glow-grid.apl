⍝ Controls
size←108
spacing←18
glow←3

⍝ Every third row of orbs steps a third of a cell sideways, so the
⍝ lattice runs in diagonals rather than in columns and repeats over
⍝ three rows rather than over an irrational height
R←(size,size)⍴¯1+⍳size
C←⍉R
step←(3|⌊R÷spacing)×spacing÷3

⍝ How far each point sits from the middle of the cell it falls in
u←((spacing|C+step)÷spacing)-0.5
v←((spacing|R)÷spacing)-0.5
d←((u*2)+v*2)*0.5

⍝ Faded to nothing at half a cell out, so the orbs are round and never
⍝ meet. The fade is clipped at zero before the glow bends it, because a
⍝ negative distance raised to a fractional power is not a number
⌊0.5+99×(0⌈1-2×d)*glow÷2
