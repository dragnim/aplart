⍝ Controls
size←128
iterations←48
realC←¯0.8
imagC←0.156
centreX←0
centreY←0
zoom←1.3

⍝ The patch of the plane to look at, as two real matrices.
⍝ TryAPL does not support complex numbers, so the real and imaginary
⍝ parts are carried separately.
ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1
ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1

⍝ Two changes make this a Julia set rather than a Mandelbrot set.
⍝ The first: the grid is where z begins, instead of where c comes from.
startR←(size,size)⍴ax
startI←⍉(size,size)⍴ay

⍝ Repeat z←z²+c, counting the steps each point survives. `a` marks the
⍝ points that have not escaped; once one has, it can never count again.
⍝ The second change: c is one constant shared by every point on the grid.
step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊realC+(zr*2)-zi*2)(¯9⌈9⌊imagC+2×zr×zi)a(n+a)}
⊃⌽step⍣iterations⊢startR startI((size,size)⍴1)(startR×0)
