⍝ Controls
size←72
frequency←8
phase←0
symmetry←5

⍝ Coordinates running from zero to one, across and down
u←(¯1+⍳size)÷size
X←(size,size)⍴u
Y←⍉X

⍝ Wave directions spread over half a circle. Over a whole circle each
⍝ direction would be paired with its opposite, and those cancel exactly.
angles←○(¯1+⍳symmetry)÷symmetry

⍝ Add one straight wave travelling in each direction
⌊0.5+100×⊃+/(1○phase+○2×frequency×((2○angles)×⊂X)+(1○angles)×⊂Y)
