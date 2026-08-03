⍝ Controls
size←128
iterations←48
power←3
centreX←0
centreY←0
zoom←1.4

⍝ The patch of the plane to look at, as two real matrices.
⍝ TryAPL does not support complex numbers, so the real and imaginary
⍝ parts are carried separately.
ax←centreX+zoom×¯1+2×(¯1+⍳size)÷size-1
ay←centreY+zoom×¯1+2×(¯1+⍳size)÷size-1
cr←(size,size)⍴ax
ci←⍉(size,size)⍴ay

⍝ Multiply ⍵ by ⍺, both as (real imaginary) pairs, written out because there
⍝ are no complex numbers to do it with.
by←{(mr mi)←⍺ ⋄ (pr pi)←⍵ ⋄ ((pr×mr)-pi×mi)((pr×mi)+pi×mr)}

⍝ Repeat z←z*power+c, counting the steps each point survives. `a` marks the
⍝ points that have not escaped; once one has, it can never count again.
⍝ The one change from Mandelbrot is ⍣(power-1): the exponent is a control
⍝ rather than a square written into the program. Multiplying z by itself
⍝ power-1 times is z*power, so power←2 multiplies once and is exactly z².
step←{(zr zi a n)←⍵ ⋄ a←a∧4>(zr*2)+zi*2 ⋄ (wr wi)←(zr zi)(by⍣(power-1))zr zi ⋄ (¯9⌈9⌊cr+wr)(¯9⌈9⌊ci+wi)a(n+a)}
⊃⌽step⍣iterations⊢(cr×0)(ci×0)((size,size)⍴1)(cr×0)
