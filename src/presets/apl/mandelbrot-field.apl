⍝ Controls
size←128
iterations←48
centreX←¯0.6
centreY←0
zoom←1.4

⍝ The patch of the plane to look at, as two real matrices.
⍝ TryAPL does not support complex numbers, so the real and imaginary
⍝ parts are carried separately.
ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1
ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1
cr←(size,size)⍴ax
ci←⍉(size,size)⍴ay

⍝ Repeat z←z²+c, counting the steps each point survives. `a` marks the
⍝ points that have not escaped; once one has, it can never count again.
step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (¯9⌈9⌊cr+(zr*2)-zi*2)(¯9⌈9⌊ci+2×zr×zi)a(n+a)}
⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)
