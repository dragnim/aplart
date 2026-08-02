⍝ Controls
size←20
seed←7
classes←2

⍝ Hash each cell position into a tile class.
⍝ Sine of a large angle is what does the scrambling. Multiplying the row
⍝ and column numbers together looks random but is not: the step along a
⍝ row is fixed, so whenever it lands near a whole number the whole row
⍝ comes out almost constant and a band appears across the tiling.
angle←(12.9898×⍳size)∘.+(78.233×⍳size)+seed×0.6180339887
classes|⌊classes×1|43758.5453×1○angle
